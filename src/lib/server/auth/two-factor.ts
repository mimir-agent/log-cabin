import type { Cookies } from '@sveltejs/kit';
import { and, count, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { db, schema } from '../db';
import { cancelFailure, takeFailureSlot } from './password';
import { hashToken, randomToken } from './session';
import { matchingStep, newSecret } from './totp';
import { auth } from '../../strings/auth';

// Two-factor sign-in: once on, every sign-in method (password, emailed link, Google) is
// followed by a code from an authenticator app or one of ten single-use recovery codes.
// Only the person themselves can see or change it; admins have no view of it.

const recoveryCodeCount = 10;
const challengeCookie = 'campfire_two_factor';
const challengeMs = 10 * 60 * 1000;

export type TwoFactorState = { enabled: boolean; pendingSecret: string | null; codesLeft: number };

export async function twoFactorState(env: Env, userId: string): Promise<TwoFactorState> {
	const d = db(env);
	const user = await d
		.select({ secret: schema.users.totpSecret, enabledAt: schema.users.totpEnabledAt })
		.from(schema.users)
		.where(eq(schema.users.id, userId))
		.get();
	if (!user) throw new Error(`twoFactorState: no user ${userId}`);
	const codes = await d
		.select({ n: count() })
		.from(schema.recoveryCodes)
		.where(and(eq(schema.recoveryCodes.userId, userId), isNull(schema.recoveryCodes.usedAt)))
		.get();
	const enabled = user.enabledAt !== null;
	return { enabled, pendingSecret: enabled ? null : user.secret, codesLeft: codes?.n ?? 0 };
}

/** Gives a user without two-factor a fresh secret to add to their authenticator app. */
export async function startEnrolment(env: Env, userId: string): Promise<void> {
	await db(env)
		.update(schema.users)
		.set({ totpSecret: newSecret(), totpLastStep: null })
		.where(and(eq(schema.users.id, userId), isNull(schema.users.totpEnabledAt)));
}

/**
 * Uses up a code from the authenticator if it is right for now (±30 s) and newer than the
 * last one accepted, so a code someone has watched being typed can't be replayed.
 */
async function takeTotpCode(env: Env, userId: string, code: string, now: number) {
	const { users } = schema;
	const user = await db(env)
		.select({ secret: users.totpSecret })
		.from(users)
		.where(eq(users.id, userId))
		.get();
	if (!user?.secret) return false;
	const step = await matchingStep(user.secret, code, now);
	if (step === null) return false;
	const taken = await db(env)
		.update(users)
		.set({ totpLastStep: step })
		.where(and(eq(users.id, userId), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
		.returning({ id: users.id })
		.get();
	return taken !== undefined;
}

/** Recovery codes are 20 hex characters; spaces and dashes typed with them are ignored. */
function normalizeRecoveryCode(code: string): string {
	return code.replace(/[\s-]/g, '').toLowerCase();
}

async function takeRecoveryCode(env: Env, userId: string, code: string, now: number) {
	const { recoveryCodes } = schema;
	const used = await db(env)
		.update(recoveryCodes)
		.set({ usedAt: now })
		.where(
			and(
				eq(recoveryCodes.codeHash, await hashToken(normalizeRecoveryCode(code))),
				eq(recoveryCodes.userId, userId),
				isNull(recoveryCodes.usedAt)
			)
		)
		.returning({ userId: recoveryCodes.userId })
		.get();
	return used !== undefined;
}

/** Replaces the user's recovery codes with ten new ones and returns them, once. */
async function newRecoveryCodes(env: Env, userId: string, now: number): Promise<string[]> {
	const codes = Array.from({ length: recoveryCodeCount }, () =>
		Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) =>
			b.toString(16).padStart(2, '0')
		).join('')
	);
	const rows = await Promise.all(
		codes.map(async (code) => ({ codeHash: await hashToken(code), userId, createdAt: now }))
	);
	const d = db(env);
	await d.batch([
		d.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId)),
		d.insert(schema.recoveryCodes).values(rows)
	]);
	return codes;
}

type Checked = { ok: true } | { ok: false; message: string };

/**
 * Uses up a second-factor answer if it is right: a 6-digit authenticator code, or a recovery
 * code when `recovery` allows one. Five wrong answers in 15 minutes lock it for the rest of
 * the window.
 */
export async function takeSecondFactor(
	env: Env,
	userId: string,
	answer: string,
	{ recovery }: { recovery: boolean },
	now = Date.now()
): Promise<Checked> {
	const errors = auth.twoFactor.errors;
	const failure = await takeFailureSlot(env, `two-factor:${userId}`, now);
	if (failure === null) return { ok: false, message: errors.rateLimited };
	const code = answer.trim();
	const right = /^\d{6}$/.test(code)
		? await takeTotpCode(env, userId, code, now)
		: recovery && (await takeRecoveryCode(env, userId, code, now));
	if (!right) return { ok: false, message: errors.wrong };
	await cancelFailure(env, failure);
	return { ok: true };
}

/** Turns two-factor on once the user proves their app has the secret; returns their codes. */
export async function confirmEnrolment(
	env: Env,
	userId: string,
	code: string,
	now = Date.now()
): Promise<{ ok: true; codes: string[] } | { ok: false; message: string }> {
	const checked = await takeSecondFactor(env, userId, code, { recovery: false }, now);
	if (!checked.ok) return checked;
	await db(env).update(schema.users).set({ totpEnabledAt: now }).where(eq(schema.users.id, userId));
	return { ok: true, codes: await newRecoveryCodes(env, userId, now) };
}

/** Turns two-factor off; needs an authenticator code or a recovery code. */
export async function disableTwoFactor(
	env: Env,
	userId: string,
	code: string,
	now = Date.now()
): Promise<Checked> {
	const checked = await takeSecondFactor(env, userId, code, { recovery: true }, now);
	if (!checked.ok) return checked;
	const d = db(env);
	await d.batch([
		d
			.update(schema.users)
			.set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null })
			.where(eq(schema.users.id, userId)),
		d.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId))
	]);
	return { ok: true };
}

/** Replaces the recovery codes; needs an authenticator code. */
export async function regenerateRecoveryCodes(
	env: Env,
	userId: string,
	code: string,
	now = Date.now()
): Promise<{ ok: true; codes: string[] } | { ok: false; message: string }> {
	const checked = await takeSecondFactor(env, userId, code, { recovery: false }, now);
	if (!checked.ok) return checked;
	return { ok: true, codes: await newRecoveryCodes(env, userId, now) };
}

export async function twoFactorEnabled(env: Env, userId: string): Promise<boolean> {
	const row = await db(env)
		.select({ id: schema.users.id })
		.from(schema.users)
		.where(and(eq(schema.users.id, userId), isNotNull(schema.users.totpEnabledAt)))
		.get();
	return row !== undefined;
}

/** Holds a sign-in that passed its first method until the second is answered. */
export async function createChallenge(
	env: Env,
	cookies: Cookies,
	userId: string,
	now = Date.now()
): Promise<void> {
	const token = randomToken();
	const expiresAt = now + challengeMs;
	await db(env)
		.insert(schema.twoFactorChallenges)
		.values({ tokenHash: await hashToken(token), userId, expiresAt, createdAt: now });
	cookies.set(challengeCookie, token, {
		path: '/login',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		expires: new Date(expiresAt)
	});
}

/**
 * The user an unexpired challenge cookie belongs to, or null. Null too when the member has
 * been deactivated since passing the first method.
 */
export async function challengeUser(
	env: Env,
	cookies: Cookies,
	now = Date.now()
): Promise<string | null> {
	const token = cookies.get(challengeCookie);
	if (!token) return null;
	const { twoFactorChallenges, members } = schema;
	const row = await db(env)
		.select({ userId: twoFactorChallenges.userId })
		.from(twoFactorChallenges)
		.innerJoin(members, eq(members.userId, twoFactorChallenges.userId))
		.where(
			and(
				eq(twoFactorChallenges.tokenHash, await hashToken(token)),
				gt(twoFactorChallenges.expiresAt, now),
				isNull(members.deactivatedAt)
			)
		)
		.get();
	return row?.userId ?? null;
}

export async function endChallenge(env: Env, cookies: Cookies): Promise<void> {
	const token = cookies.get(challengeCookie);
	if (!token) throw new Error('endChallenge: expected a two-factor challenge cookie, found none');
	await db(env)
		.delete(schema.twoFactorChallenges)
		.where(eq(schema.twoFactorChallenges.tokenHash, await hashToken(token)));
	cookies.delete(challengeCookie, {
		path: '/login',
		httpOnly: true,
		secure: true,
		sameSite: 'lax'
	});
}
