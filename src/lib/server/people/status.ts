import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { db, schema } from '../db';
import {
	isStatusExpiry,
	statusEmojiMax,
	statusExpiresAt,
	statusTextMax
} from '../../people/status';
import { people } from '../../strings/people';

export type StatusInput = { emoji: string; text: string; expiry: string; customAt?: string };

/** Sets a person's status. "today", "this week" and a custom time are read in their time zone. */
export async function setStatus(
	env: Env,
	userId: string,
	input: StatusInput,
	now = Date.now()
): Promise<{ ok: true } | { ok: false; message: string }> {
	const { errors } = people.status;
	const emoji = input.emoji.trim();
	const text = input.text.trim();
	if (!emoji || emoji.length > statusEmojiMax) return { ok: false, message: errors.emojiMissing };
	if (!text) return { ok: false, message: errors.textMissing };
	if ([...text].length > statusTextMax) return { ok: false, message: errors.textTooLong };
	if (!isStatusExpiry(input.expiry)) return { ok: false, message: errors.expiryInvalid };
	const { users } = schema;
	const d = db(env);
	const user = await d
		.select({ timezone: users.timezone })
		.from(users)
		.where(eq(users.id, userId))
		.get();
	if (!user) throw new Error(`setStatus: expected user ${userId}, found none`);
	const expiresAt = statusExpiresAt(input.expiry, now, user.timezone, input.customAt);
	if (expiresAt === 'invalid') return { ok: false, message: errors.expiryInvalid };
	if (expiresAt !== null && expiresAt <= now) return { ok: false, message: errors.customInPast };
	await d
		.update(users)
		.set({ statusEmoji: emoji, statusText: text, statusExpiresAt: expiresAt })
		.where(eq(users.id, userId));
	return { ok: true };
}

export async function clearStatus(env: Env, userId: string): Promise<void> {
	const { users } = schema;
	await db(env)
		.update(users)
		.set({ statusEmoji: null, statusText: null, statusExpiresAt: null })
		.where(eq(users.id, userId));
}

/** Run by the five-minute cron: clears every status whose time has come. */
export async function clearExpiredStatuses(env: Env, now: number): Promise<void> {
	const { users } = schema;
	await db(env)
		.update(users)
		.set({ statusEmoji: null, statusText: null, statusExpiresAt: null })
		.where(and(isNotNull(users.statusExpiresAt), lte(users.statusExpiresAt, now)));
}
