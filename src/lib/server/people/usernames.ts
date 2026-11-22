import { and, eq, gt, ne } from 'drizzle-orm';
import { db, schema } from '../db';
import { people } from '../../strings/people';

/** Lowercase letters, digits, "_" and "-", 2 to 32 of them. migrations/0015 enforces the same. */
export const usernamePattern = /^[a-z0-9_-]{2,32}$/;

/** How long a changed username keeps pointing at its person, and stays theirs. */
export const usernameRedirectMs = 30 * 24 * 60 * 60 * 1000;

/**
 * A username made from a name: its letters and digits, accents dropped, lowercased. The same
 * rule as 0015's backfill, which can't drop accents, so it leaves those letters out instead.
 * Short enough to take a "-NNNN" suffix.
 */
export function suggestUsername(name: string): string {
	const kept = name
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
	return kept.length >= 2 ? kept.slice(0, 27) : 'member';
}

/** Someone else has it, or it still points at someone who changed theirs. */
async function isTaken(env: Env, username: string, userId: string | null, now: number) {
	const { users, usernameRedirects } = schema;
	const d = db(env);
	const owner = await d
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.username, username), userId ? ne(users.id, userId) : undefined))
		.get();
	if (owner) return true;
	const held = await d
		.select({ userId: usernameRedirects.userId })
		.from(usernameRedirects)
		.where(and(eq(usernameRedirects.username, username), gt(usernameRedirects.expiresAt, now)))
		.get();
	return held !== undefined && held.userId !== userId;
}

/** `base` if it is free, otherwise the first free `base-2`, `base-3`, ... */
export async function availableUsername(env: Env, base: string, now = Date.now()) {
	for (let n = 1; ; n++) {
		const candidate = n === 1 ? base : `${base}-${n}`;
		if (!(await isTaken(env, candidate, null, now))) return candidate;
	}
}

export type UsernameOutcome = { ok: true; username: string } | { ok: false; message: string };

/**
 * Changes a person's username. The old one redirects to them for 30 days and nobody else can
 * take it meanwhile; taking back one of your own old usernames ends its redirect.
 */
export async function changeUsername(
	env: Env,
	userId: string,
	input: string,
	now = Date.now()
): Promise<UsernameOutcome> {
	const { errors } = people.username;
	const username = input.trim().toLowerCase();
	if (!usernamePattern.test(username)) return { ok: false, message: errors.invalid };
	const { users, usernameRedirects } = schema;
	const d = db(env);
	const current = await d
		.select({ username: users.username })
		.from(users)
		.where(eq(users.id, userId))
		.get();
	if (!current) throw new Error(`changeUsername: expected user ${userId}, found none`);
	if (current.username === username) return { ok: true, username };
	if (await isTaken(env, username, userId, now)) return { ok: false, message: errors.taken };
	await d.batch([
		d.delete(usernameRedirects).where(eq(usernameRedirects.username, username)),
		d
			.insert(usernameRedirects)
			.values({ username: current.username, userId, expiresAt: now + usernameRedirectMs })
			.onConflictDoUpdate({
				target: usernameRedirects.username,
				set: { userId, expiresAt: now + usernameRedirectMs }
			}),
		d.update(users).set({ username }).where(eq(users.id, userId))
	]);
	return { ok: true, username };
}

export type UsernameLookup = { userId: string } | { redirectTo: string } | null;

/**
 * Whose username this is, read without regard to case: the person who has it now, or, for a
 * changed one under 30 days old, their current username to redirect to.
 */
export async function lookUpUsername(
	env: Env,
	typed: string,
	now = Date.now()
): Promise<UsernameLookup> {
	const username = typed.toLowerCase();
	const { users, usernameRedirects } = schema;
	const d = db(env);
	const owner = await d
		.select({ id: users.id })
		.from(users)
		.where(eq(users.username, username))
		.get();
	if (owner) return { userId: owner.id };
	const redirect = await d
		.select({ username: users.username })
		.from(usernameRedirects)
		.innerJoin(users, eq(users.id, usernameRedirects.userId))
		.where(and(eq(usernameRedirects.username, username), gt(usernameRedirects.expiresAt, now)))
		.get();
	return redirect ? { redirectTo: redirect.username } : null;
}
