import { describe, expect, it } from 'vitest';
import { fakeD1 } from './testing/fake-d1';
import { createOrgAndAdmin } from './setup';
import { changeRole, createMember, getMember, listMembers, setDeactivated } from './members';
import { createSession, readSession } from './auth/session';
import { decideSignIn, signInFacts } from './auth/sign-in';

async function orgWithAdmin() {
	const { DB, sqlite } = fakeD1();
	const hubCalls: { url: string; body: unknown }[] = [];
	const REALTIME = {
		idFromName: (name: string) => name,
		get: () => ({
			fetch: async (url: string, init: RequestInit) => {
				hubCalls.push({ url, body: JSON.parse(String(init.body)) });
				return new Response(null, { status: 204 });
			}
		})
	};
	const env = { DB, REALTIME } as unknown as Env;
	await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' });
	const [admin] = await listMembers(env, { query: '', includeDeactivated: false });
	return { env, sqlite, admin, hubCalls };
}

describe('the last admin', () => {
	it('cannot be demoted or deactivated', async () => {
		const { env, admin } = await orgWithAdmin();

		expect(await changeRole(env, admin, 'member')).toMatchObject({ ok: false });
		expect(await setDeactivated(env, admin, true)).toMatchObject({ ok: false });
		expect(
			await getMember(env, admin.id),
			'the last admin must stay an active admin'
		).toMatchObject({ role: 'admin', deactivatedAt: null });
	});

	it('can be demoted once there is a second admin', async () => {
		const { env, admin } = await orgWithAdmin();
		await createMember(env, { email: 'grace@example.com', name: 'Grace', role: 'admin' });

		expect(await changeRole(env, admin, 'member')).toEqual({ ok: true });
		expect((await getMember(env, admin.id))?.role).toBe('member');
	});
});

describe('deactivating a member', () => {
	it('signs them out everywhere, closes their live connections and stops them signing in until reactivated', async () => {
		const { env, sqlite, hubCalls } = await orgWithAdmin();
		const { memberId, userId } = await createMember(env, {
			email: 'bob@example.com',
			name: 'Bob',
			role: 'member'
		});
		const { token } = await createSession(env, userId);
		expect(await readSession(env, token)).not.toBeNull();

		const bob = (await getMember(env, memberId))!;
		expect(await setDeactivated(env, bob, true)).toEqual({ ok: true });

		expect(
			await readSession(env, token),
			'a deactivated member’s session must not read'
		).toBeNull();
		expect(hubCalls, 'their open realtime sockets must be closed').toEqual([
			{ url: 'https://realtime/disconnect', body: { userId } }
		]);
		expect(sqlite.prepare('SELECT * FROM sessions WHERE user_id = ?').all(userId)).toEqual([]);
		expect(decideSignIn(await signInFacts(env, 'bob@example.com', true))).toEqual({
			kind: 'refuse',
			reason: 'deactivated'
		});

		expect(await setDeactivated(env, (await getMember(env, memberId))!, false)).toEqual({
			ok: true
		});
		expect(decideSignIn(await signInFacts(env, 'bob@example.com', true))).toEqual({
			kind: 'sign-in',
			userId
		});
	});
});

describe('listMembers', () => {
	it('finds members by part of their name and hides deactivated ones unless asked', async () => {
		const { env } = await orgWithAdmin();
		await createMember(env, { email: 'grace@example.com', name: 'Grace Hopper', role: 'member' });
		const { memberId } = await createMember(env, {
			email: 'gary@example.com',
			name: 'Gary Hopkins',
			role: 'member'
		});
		await setDeactivated(env, (await getMember(env, memberId))!, true);

		const names = async (query: string, includeDeactivated: boolean) =>
			(await listMembers(env, { query, includeDeactivated })).map((m) => m.name);

		expect(await names('Hop', false)).toEqual(['Grace Hopper']);
		expect(await names('Hop', true)).toEqual(['Gary Hopkins', 'Grace Hopper']);
		expect(await names('', false)).toEqual(['Ada', 'Grace Hopper']);
	});
});
