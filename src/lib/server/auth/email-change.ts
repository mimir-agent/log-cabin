import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { sendEmail } from '../email';
import { confirmEmailMail, emailChangedMail } from '../email/templates';
import { isEmail } from '../setup';
import { emailLimit, ipLimit, takeAttempt } from './magic-link';
import { hashToken, randomToken } from './session';

const linkHours = 1;
const linkMs = linkHours * 60 * 60 * 1000;

export type EmailChangeRefusal = 'emailInvalid' | 'same' | 'taken' | 'rateLimited';

/**
 * Mails a link to `newEmail`; the sign-in email stays as it is until the link is confirmed.
 * Asking again replaces the earlier link. A taken address counts against the limit like any
 * other, so the answer can't be used in bulk to find out who has an account.
 */
export async function requestEmailChange(
	env: Env,
	input: { userId: string; newEmail: string; ip: string; origin: string; orgName: string },
	now = Date.now()
): Promise<{ ok: true; newEmail: string } | { ok: false; reason: EmailChangeRefusal }> {
	const newEmail = input.newEmail.trim().toLowerCase();
	if (!isEmail(newEmail)) return { ok: false, reason: 'emailInvalid' };
	const allowed =
		(await takeAttempt(env, `email-change-ip:${input.ip}`, ipLimit, now)) &&
		(await takeAttempt(env, `email-change:${input.userId}`, emailLimit, now));
	if (!allowed) return { ok: false, reason: 'rateLimited' };

	const { users, emailChangeTokens: tokens } = schema;
	const current = await db(env)
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, input.userId))
		.get();
	if (!current) throw new Error(`requestEmailChange: no user ${input.userId}`);
	if (current.email === newEmail) return { ok: false, reason: 'same' };
	const taken = await db(env)
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, newEmail))
		.get();
	if (taken) return { ok: false, reason: 'taken' };

	const token = randomToken();
	await db(env).batch([
		db(env).delete(tokens).where(eq(tokens.userId, input.userId)),
		db(env)
			.insert(tokens)
			.values({
				tokenHash: await hashToken(token),
				userId: input.userId,
				newEmail,
				expiresAt: now + linkMs,
				createdAt: now
			})
	]);
	const link = `${input.origin}/login/confirm-email?token=${encodeURIComponent(token)}`;
	await sendEmail(env, {
		to: newEmail,
		...confirmEmailMail(input.orgName, newEmail, linkHours, link)
	});
	return { ok: true, newEmail };
}

/** The address waiting for its link to be opened, or null. */
export async function pendingEmailChange(
	env: Env,
	userId: string,
	now = Date.now()
): Promise<string | null> {
	const { emailChangeTokens: tokens } = schema;
	const row = await db(env)
		.select({ newEmail: tokens.newEmail })
		.from(tokens)
		.where(and(eq(tokens.userId, userId), isNull(tokens.usedAt), gt(tokens.expiresAt, now)))
		.orderBy(desc(tokens.createdAt))
		.get();
	return row?.newEmail ?? null;
}

/** The address a live link is for, or null. Looking it up doesn't use the link up. */
export async function sentEmailChange(
	env: Env,
	token: string,
	now = Date.now()
): Promise<string | null> {
	const { emailChangeTokens: tokens } = schema;
	const row = await db(env)
		.select({ newEmail: tokens.newEmail })
		.from(tokens)
		.where(
			and(
				eq(tokens.tokenHash, await hashToken(token)),
				isNull(tokens.usedAt),
				gt(tokens.expiresAt, now)
			)
		)
		.get();
	return row?.newEmail ?? null;
}

/**
 * Uses up the link and makes its address the sign-in email, then tells the old address.
 * Not ok when the link is unknown, used or expired, or the address was taken since it was
 * sent; the answer doesn't say which.
 */
export async function confirmEmailChange(
	env: Env,
	token: string,
	origin: string,
	orgName: string,
	now = Date.now()
): Promise<{ ok: true; email: string } | { ok: false }> {
	const { emailChangeTokens: tokens, users } = schema;
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
		.returning({ userId: tokens.userId, newEmail: tokens.newEmail })
		.get();
	if (!used) return { ok: false };

	const previous = await db(env)
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, used.userId))
		.get();
	if (!previous) throw new Error(`confirmEmailChange: no user ${used.userId}`);
	const changed = await db(env)
		.update(users)
		.set({ email: used.newEmail })
		.where(
			and(
				eq(users.id, used.userId),
				sql`NOT EXISTS (SELECT 1 FROM users other WHERE other.email = ${used.newEmail})`
			)
		)
		.returning({ id: users.id })
		.get();
	if (!changed) return { ok: false };

	await sendEmail(env, {
		to: previous.email,
		...emailChangedMail(orgName, used.newEmail, origin)
	});
	return { ok: true, email: used.newEmail };
}
