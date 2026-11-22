import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { recordUnderLimit } from './attempts';
import { auth } from '../../strings/auth';

// Passwords are optional: a member may set one in settings and then sign in with it, as
// well as by emailed link or Google.

const iterations = 100_000; // the most PBKDF2 iterations Workers' WebCrypto allows
export const minLength = 10;
const failureLimit = 5;

function toBase64(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, rounds: number) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds },
		key,
		256
	);
	return new Uint8Array(bits);
}

/** 'pbkdf2$<iterations>$<salt>$<hash>': the iteration count travels with the hash. */
async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await pbkdf2(password, salt, iterations);
	return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [scheme, rounds, salt, hash] = stored.split('$');
	if (scheme !== 'pbkdf2') throw new Error(`verifyPassword: unknown hash scheme "${scheme}"`);
	const expected = fromBase64(hash);
	return equalBytes(await pbkdf2(password, fromBase64(salt), Number(rounds)), expected);
}

// Hashed against when the email has no password, so an unknown email takes as long to
// refuse as a wrong password does. Random bytes that no known password hashes to.
const decoyHash = `pbkdf2$${iterations}$G5zsF8IhpEgl2JgqFJnIpQ==$OIu/HTFu5wnpCj3OUGMLCMGi6l3CsNtrv63uYo9Yrwg=`;

/**
 * Whether Have I Been Pwned lists this password. Only the first five characters of its
 * SHA-1 leave the Worker (the k-anonymity range API). If the API can't be reached the
 * password is accepted: a breach list outage shouldn't stop anyone choosing a password.
 */
async function pwned(password: string): Promise<boolean> {
	const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
	const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
		.join('')
		.toUpperCase();
	const url = `https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`;
	let body: string;
	try {
		const response = await fetch(url, { headers: { 'Add-Padding': 'true' } });
		if (!response.ok) throw new Error(`answered ${response.status}`);
		body = await response.text();
	} catch (e) {
		console.warn(`password breach check skipped: ${url} failed (${String(e)})`);
		return false;
	}
	// Each line is '<rest of the hash>:<times seen>'; padding lines have a count of 0.
	return body.split('\n').some((line) => {
		const [suffix, seen] = line.trim().split(':');
		return suffix === hex.slice(5) && Number(seen) > 0;
	});
}

/** Why a new password can't be used, or null when it can. */
export async function newPasswordProblem(password: string): Promise<string | null> {
	if (password.length < minLength) return auth.password.errors.tooShort(minLength);
	if (await pwned(password)) return auth.password.errors.pwned;
	return null;
}

/** Sets a password the caller has already checked with newPasswordProblem. */
export async function setPassword(env: Env, userId: string, password: string): Promise<void> {
	await db(env)
		.update(schema.users)
		.set({ passwordHash: await hashPassword(password) })
		.where(eq(schema.users.id, userId));
}

/** The user's stored password hash, or null when they have no password. */
export async function storedPasswordHash(env: Env, userId: string): Promise<string | null> {
	const row = await db(env)
		.select({ passwordHash: schema.users.passwordHash })
		.from(schema.users)
		.where(eq(schema.users.id, userId))
		.get();
	if (!row) throw new Error(`storedPasswordHash: no user ${userId}`);
	return row.passwordHash;
}

/**
 * Takes one of the failure slots under `key`'s limit before the answer is checked, by
 * recording a failure, unless the limit was already reached in the last 15 minutes. One
 * statement counts and inserts, so a burst of concurrent requests can't all get under the
 * limit. Returns the failure's id, for `cancelFailure` when the answer turns out right, or
 * null when no slot is left and the caller must refuse.
 */
export async function takeFailureSlot(
	env: Env,
	key: string,
	now = Date.now()
): Promise<number | null> {
	return recordUnderLimit(env, key, failureLimit, now);
}

export async function cancelFailure(env: Env, id: number) {
	await db(env)
		.delete(schema.signInAttempts)
		.where(sql`rowid = ${id}`);
}

/**
 * Checks an email and password. Every wrong answer gets the same message, whether or not
 * the email has an account or a password, so the form doesn't reveal who has one.
 */
export async function passwordSignIn(
	env: Env,
	input: { email: string; password: string },
	now = Date.now()
): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
	const errors = auth.password.errors;
	const failure = await takeFailureSlot(env, `password:${input.email}`, now);
	if (failure === null) return { ok: false, message: errors.rateLimited };

	const { users, members } = schema;
	const account = await db(env)
		.select({
			userId: users.id,
			passwordHash: users.passwordHash,
			deactivatedAt: members.deactivatedAt
		})
		.from(users)
		.innerJoin(members, eq(members.userId, users.id))
		.where(eq(users.email, input.email))
		.get();
	const matches = await verifyPassword(input.password, account?.passwordHash ?? decoyHash);
	if (!account?.passwordHash || !matches) return { ok: false, message: errors.wrong };
	await cancelFailure(env, failure);
	if (account.deactivatedAt !== null) return { ok: false, message: auth.login.errors.deactivated };
	return { ok: true, userId: account.userId };
}
