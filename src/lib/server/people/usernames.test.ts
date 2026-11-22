import { describe, expect, it } from 'vitest';
import { fakeD1 } from '../testing/fake-d1';
import { createOrgAndAdmin } from '../setup';
import { createMember, getMember } from '../members';
import { changeUsername, lookUpUsername, usernameRedirectMs } from './usernames';

const day = 24 * 60 * 60 * 1000;

async function org() {
	const { DB } = fakeD1();
	const env = { DB } as unknown as Env;
	await createOrgAndAdmin(env, {
		orgName: 'Acme',
		adminName: 'Ada Okafor',
		email: 'ada@example.com'
	});
	const bo = await createMember(env, { email: 'bo@example.com', name: 'Bo Chen', role: 'member' });
	const ada = await lookUpUsername(env, 'adaokafor');
	if (!ada || !('userId' in ada)) throw new Error('setup: expected the admin at adaokafor');
	return { env, adaId: ada.userId, boId: bo.userId, boMemberId: bo.memberId };
}

describe('a new member’s username', () => {
	it('comes from their name, and the second person with the same name gets a number', async () => {
		const { env } = await org();
		const second = await createMember(env, {
			email: 'ada2@example.com',
			name: 'Ada Okafor',
			role: 'member'
		});
		const accented = await createMember(env, {
			email: 'z@example.com',
			name: 'Zoë Ñúñez',
			role: 'member'
		});
		const noLatin = await createMember(env, { email: 'l@example.com', name: '李', role: 'member' });

		expect((await getMember(env, second.memberId))?.username).toBe('adaokafor-2');
		expect((await getMember(env, accented.memberId))?.username).toBe('zoenunez');
		expect((await getMember(env, noLatin.memberId))?.username).toBe('member');
	});
});

describe('changing a username', () => {
	it.each([
		['too short', 'a'],
		['too long', 'a'.repeat(33)],
		['a space', 'bo chen'],
		['a dot', 'bo.chen'],
		['an accent', 'zoë']
	])('refuses one with %s', async (_, input) => {
		const { env, boId } = await org();
		expect(await changeUsername(env, boId, input)).toMatchObject({ ok: false });
	});

	it('lowercases what was typed and accepts letters, digits, "_" and "-"', async () => {
		const { env, boId } = await org();
		expect(await changeUsername(env, boId, ' Bo_Chen-2 ')).toEqual({
			ok: true,
			username: 'bo_chen-2'
		});
		expect(await lookUpUsername(env, 'bo_chen-2')).toEqual({ userId: boId });
		expect(await lookUpUsername(env, 'Bo_Chen-2')).toEqual({ userId: boId });
	});

	it('refuses a username someone else has', async () => {
		const { env, boId } = await org();
		expect(await changeUsername(env, boId, 'adaokafor')).toMatchObject({ ok: false });
	});

	it('sends the old username to the new one for 30 days, then lets it go', async () => {
		const { env, boId } = await org();
		const t0 = Date.UTC(2026, 10, 1);
		await changeUsername(env, boId, 'bo', t0);

		expect(await lookUpUsername(env, 'bochen', t0 + 29 * day)).toEqual({ redirectTo: 'bo' });
		expect(await lookUpUsername(env, 'bochen', t0 + usernameRedirectMs + 1)).toBeNull();
	});

	it('keeps the old username from anyone else while it redirects, and frees it after', async () => {
		const { env, adaId, boId } = await org();
		const t0 = Date.UTC(2026, 10, 1);
		await changeUsername(env, boId, 'bo', t0);

		expect(await changeUsername(env, adaId, 'bochen', t0 + day)).toMatchObject({ ok: false });
		expect(await changeUsername(env, adaId, 'bochen', t0 + usernameRedirectMs + 1)).toEqual({
			ok: true,
			username: 'bochen'
		});
	});

	it('lets its owner take an old username back', async () => {
		const { env, boId } = await org();
		const t0 = Date.UTC(2026, 10, 1);
		await changeUsername(env, boId, 'bo', t0);
		expect(await changeUsername(env, boId, 'bochen', t0 + day)).toEqual({
			ok: true,
			username: 'bochen'
		});
		expect(await lookUpUsername(env, 'bochen', t0 + day)).toEqual({ userId: boId });
		expect(await lookUpUsername(env, 'bo', t0 + day)).toEqual({ redirectTo: 'bochen' });
	});
});
