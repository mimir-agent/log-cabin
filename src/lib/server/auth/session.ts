import type { Cookies } from '@sveltejs/kit';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from '../db';

export const sessionCookie = 'campfire_session';
const sessionMs = 30 * 24 * 60 * 60 * 1000;

export type SignedIn = {
	user: NonNullable<App.Locals['user']>;
	member: NonNullable<App.Locals['member']>;
};

/** SHA-256 of the cookie token, as hex. Only the hash is stored. */
export async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');
}

export async function createSession(
	env: Env,
	userId: string,
	now = Date.now()
): Promise<{ token: string; expiresAt: number }> {
	const token = randomToken();
	const expiresAt = now + sessionMs;
	await db(env)
		.insert(schema.sessions)
		.values({ tokenHash: await hashToken(token), userId, expiresAt, createdAt: now });
	return { token, expiresAt };
}

/**
 * The signed-in user and member for a cookie token, and when they were last seen; null if
 * expired, unknown or deactivated.
 */
export async function readSession(
	env: Env,
	token: string,
	now = Date.now()
): Promise<(SignedIn & { lastSeenAt: number | null }) | null> {
	const { sessions, users, members } = schema;
	const row = await db(env)
		.select({ user: users, member: members })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.innerJoin(members, eq(members.userId, users.id))
		.where(
			and(
				eq(sessions.tokenHash, await hashToken(token)),
				gt(sessions.expiresAt, now),
				isNull(members.deactivatedAt)
			)
		)
		.get();
	if (!row) return null;
	const { user, member } = row;
	return {
		user: {
			id: user.id,
			name: user.name,
			username: user.username,
			email: user.email,
			avatarUrl: user.avatarKey ? `/files/${user.avatarKey}` : null,
			theme: user.theme
		},
		member: { id: member.id, role: member.role },
		lastSeenAt: user.lastSeenAt
	};
}

export async function deleteSession(env: Env, token: string): Promise<void> {
	await db(env)
		.delete(schema.sessions)
		.where(eq(schema.sessions.tokenHash, await hashToken(token)));
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: number): void {
	cookies.set(sessionCookie, token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		expires: new Date(expiresAt)
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(sessionCookie, { path: '/', httpOnly: true, secure: true, sameSite: 'lax' });
}
