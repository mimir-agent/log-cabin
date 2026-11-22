import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { sendEmail } from '../email';
import { resetMail } from '../email/templates';
import { disconnectUser } from '../realtime/publish';
import { emailLimit, ipLimit, takeAttempt } from './magic-link';
import { setPassword } from './password';
import { hashToken, randomToken } from './session';
import { auth } from '../../strings/auth';

const linkMs = 30 * 60 * 1000;

/**
 * Emails a reset link when the address belongs to an active member. The answer is the same
 * either way, so the form doesn't reveal who has an account; only the rate limit is reported.
 */
export async function requestPasswordReset(
	env: Env,
	input: { email: string; ip: string; origin: string; orgName: string },
	now = Date.now()
): Promise<{ ok: true } | { ok: false; message: string }> {
	const allowed =
		(await takeAttempt(env, `reset-ip:${input.ip}`, ipLimit, now)) &&
		(await takeAttempt(env, `reset:${input.email}`, emailLimit, now));
	if (!allowed) return { ok: false, message: auth.reset.errors.rateLimited };

	const { users, members } = schema;
	const account = await db(env)
		.select({ userId: users.id })
		.from(users)
		.innerJoin(members, eq(members.userId, users.id))
		.where(and(eq(users.email, input.email), isNull(members.deactivatedAt)))
		.get();
	if (!account) return { ok: true };

	const token = randomToken();
	await db(env)
		.insert(schema.passwordResetTokens)
		.values({
			tokenHash: await hashToken(token),
			userId: account.userId,
			expiresAt: now + linkMs,
			createdAt: now
		});
	const link = `${input.origin}/login/reset?token=${encodeURIComponent(token)}`;
	await sendEmail(env, {
		to: input.email,
		...resetMail(input.orgName, link)
	});
	return { ok: true };
}

/**
 * Sets a new password with a reset link's token, which then can't be used again, and signs
 * the user out everywhere. The caller has already checked the password with
 * newPasswordProblem. False when the link is unknown, used or expired, or the member has
 * been deactivated since it was sent.
 */
export async function resetPassword(
	env: Env,
	token: string,
	password: string,
	now = Date.now()
): Promise<boolean> {
	const { passwordResetTokens: tokens, members } = schema;
	const used = await db(env)
		.update(tokens)
		.set({ usedAt: now })
		.where(
			and(
				eq(tokens.tokenHash, await hashToken(token)),
				isNull(tokens.usedAt),
				gt(tokens.expiresAt, now)
			)
		)
		.returning({ userId: tokens.userId })
		.get();
	if (!used) return false;
	const active = await db(env)
		.select({ id: members.id })
		.from(members)
		.where(and(eq(members.userId, used.userId), isNull(members.deactivatedAt)))
		.get();
	if (!active) return false;

	await setPassword(env, used.userId, password);
	await db(env).delete(schema.sessions).where(eq(schema.sessions.userId, used.userId));
	await disconnectUser(env, used.userId);
	return true;
}
