import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { sendEmail } from '../email';
import { signInMail } from '../email/templates';
import { recordUnderLimit } from './attempts';
import { hashToken, randomToken } from './session';
import { decideSignIn, signInFacts } from './sign-in';
import { auth } from '../../strings/auth';

const linkMs = 15 * 60 * 1000;
// Requests allowed per window, per email address and per IP address.
export const emailLimit = 5;
export const ipLimit = 20;

/**
 * Records an attempt under `key` unless `limit` attempts already fall inside the 15-minute
 * window. Returns false when the limit is reached.
 */
export async function takeAttempt(
	env: Env,
	key: string,
	limit: number,
	now = Date.now()
): Promise<boolean> {
	return (await recordUnderLimit(env, key, limit, now)) !== null;
}

/**
 * Emails a sign-in link to `email` when it may sign in (a member, an invitee, or someone at
 * the allowed domain). The answer is the same either way, so the form doesn't reveal who
 * has an account; only the rate limit is reported.
 */
export async function requestSignInLink(
	env: Env,
	input: { email: string; ip: string; origin: string; orgName: string },
	now = Date.now()
): Promise<{ ok: true } | { ok: false; message: string }> {
	const allowed =
		(await takeAttempt(env, `ip:${input.ip}`, ipLimit, now)) &&
		(await takeAttempt(env, `email:${input.email}`, emailLimit, now));
	if (!allowed) return { ok: false, message: auth.login.errors.rateLimited };

	const decision = decideSignIn(await signInFacts(env, input.email, true, now));
	if (decision.kind === 'refuse') return { ok: true };

	const token = randomToken();
	await db(env)
		.insert(schema.signInTokens)
		.values({
			tokenHash: await hashToken(token),
			email: input.email,
			expiresAt: now + linkMs,
			createdAt: now
		});
	const link = `${input.origin}/login/verify?token=${encodeURIComponent(token)}`;
	await sendEmail(env, {
		to: input.email,
		...signInMail(input.orgName, link)
	});
	return { ok: true };
}

/** Uses up a sign-in token. Returns its email, or null if it is unknown, used or expired. */
export async function consumeSignInToken(
	env: Env,
	token: string,
	now = Date.now()
): Promise<string | null> {
	const { signInTokens } = schema;
	const row = await db(env)
		.update(signInTokens)
		.set({ usedAt: now })
		.where(
			and(
				eq(signInTokens.tokenHash, await hashToken(token)),
				isNull(signInTokens.usedAt),
				gt(signInTokens.expiresAt, now)
			)
		)
		.returning({ email: signInTokens.email })
		.get();
	return row?.email ?? null;
}
