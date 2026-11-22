import { describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { fakeD1 } from '../testing/fake-d1';
import { createOrgAndAdmin } from '../setup';
import {
	clearSessionCookie,
	createSession,
	deleteSession,
	hashToken,
	readSession,
	sessionCookie,
	setSessionCookie
} from './session';

async function signedUpEnv() {
	const { DB, sqlite } = fakeD1();
	const env = { DB } as Env;
	const userId = await createOrgAndAdmin(env, {
		orgName: 'Acme',
		adminName: 'Ada',
		email: 'ada@example.com'
	});
	return { env, sqlite, userId };
}

describe('sessions', () => {
	it('stores only the SHA-256 hex of the token, never the token itself', async () => {
		const { env, sqlite, userId } = await signedUpEnv();
		const { token } = await createSession(env, userId);
		const rows = sqlite.prepare('SELECT token_hash FROM sessions').all();
		expect(rows).toEqual([{ token_hash: await hashToken(token) }]);
		expect(await hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it('reads back the user and member for a fresh token', async () => {
		const { env, userId } = await signedUpEnv();
		const { token } = await createSession(env, userId);
		const session = await readSession(env, token);
		expect(session).toEqual({
			user: {
				id: userId,
				name: 'Ada',
				username: 'ada',
				email: 'ada@example.com',
				avatarUrl: null,
				theme: 'system'
			},
			member: { id: expect.any(String), role: 'admin' },
			lastSeenAt: null
		});
	});

	it('serves the avatar from /files/<key> when the user has one', async () => {
		const { env, sqlite, userId } = await signedUpEnv();
		sqlite.prepare('UPDATE users SET avatar_key = ? WHERE id = ?').run('avatars/ada.png', userId);
		const { token } = await createSession(env, userId);
		expect((await readSession(env, token))?.user.avatarUrl).toBe('/files/avatars/ada.png');
	});

	it('expires after 30 days', async () => {
		const { env, userId } = await signedUpEnv();
		const now = Date.now();
		const { token, expiresAt } = await createSession(env, userId, now);
		expect(expiresAt - now).toBe(30 * 24 * 60 * 60 * 1000);
		expect(await readSession(env, token, expiresAt - 1)).not.toBeNull();
		expect(await readSession(env, token, expiresAt)).toBeNull();
	});

	it('signs out a deactivated member', async () => {
		const { env, sqlite, userId } = await signedUpEnv();
		const { token } = await createSession(env, userId);
		sqlite.prepare('UPDATE members SET deactivated_at = 1 WHERE user_id = ?').run(userId);
		expect(await readSession(env, token)).toBeNull();
	});

	it('rejects an unknown token and a deleted session', async () => {
		const { env, userId } = await signedUpEnv();
		expect(await readSession(env, 'not-a-token')).toBeNull();
		const { token } = await createSession(env, userId);
		await deleteSession(env, token);
		expect(await readSession(env, token)).toBeNull();
	});

	it('sets an HttpOnly, Secure, SameSite=Lax cookie on / that expires with the session', () => {
		const cookies = { set: vi.fn(), delete: vi.fn() } as unknown as Cookies;
		setSessionCookie(cookies, 'abc', 1_000);
		expect(cookies.set).toHaveBeenCalledWith(sessionCookie, 'abc', {
			path: '/',
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			expires: new Date(1_000)
		});
		clearSessionCookie(cookies);
		expect(cookies.delete).toHaveBeenCalledWith(
			'campfire_session',
			expect.objectContaining({ path: '/' })
		);
	});
});
