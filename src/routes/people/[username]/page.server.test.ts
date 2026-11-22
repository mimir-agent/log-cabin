import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { createSession, readSession, type SignedIn } from '#lib/server/auth/session.js';
import { createMember } from '#lib/server/members.js';
import { createOrgAndAdmin } from '#lib/server/setup.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { actions, load } from './+page.server';
import { load as loadByMemberId } from '../../members/[id]/+page.server';
import { actions as ownProfile } from '../../settings/profile/+page.server';

async function world() {
	const { DB } = fakeD1();
	const env = { DB } as unknown as Env;
	useTestEnv(env);
	const signIn = async (userId: string) =>
		(await readSession(env, (await createSession(env, userId)).token))!;
	const ada = await signIn(
		await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' })
	);
	const bo = await createMember(env, { email: 'bo@example.com', name: 'Bo', role: 'member' });
	return { ada, bo: { ...bo, session: await signIn(bo.userId) } };
}

function at(who: SignedIn, path: string, params: Record<string, string>) {
	const url = new URL(`https://campfire.test${path}`);
	return { locals: who, params, url, request: new Request(url) } as never;
}

async function outcome(run: unknown) {
	try {
		return await run;
	} catch (e) {
		if (isRedirect(e)) return { redirect: e.location, status: e.status };
		if (isHttpError(e)) return { status: e.status };
		throw e;
	}
}

function rename(who: SignedIn, username: string) {
	const request = new Request('https://campfire.test/settings/profile', {
		method: 'POST',
		body: new URLSearchParams({ name: who.user.name, username })
	});
	return ownProfile.default({ locals: who, url: new URL(request.url), request } as never);
}

describe('/people/<username>', () => {
	it('offers "Message" on someone else’s profile, not on your own', async () => {
		const { ada } = await world();
		expect(await load(at(ada, '/people/bo', { username: 'bo' }))).toMatchObject({
			canMessage: true
		});
		expect(await load(at(ada, '/people/ada', { username: 'ada' }))).toMatchObject({
			canMessage: false
		});
	});

	it('opens the member’s profile', async () => {
		const { ada } = await world();
		expect(await load(at(ada, '/people/bo', { username: 'bo' }))).toMatchObject({
			member: { name: 'Bo', username: 'bo' }
		});
	});

	it('answers 404 for a username nobody has', async () => {
		const { ada } = await world();
		expect(await outcome(load(at(ada, '/people/zed', { username: 'zed' })))).toEqual({
			status: 404
		});
	});

	it('keeps the old URL working after the member renames themselves', async () => {
		const { ada, bo } = await world();
		expect(await rename(bo.session, 'bo-chen')).toEqual({ saved: true });

		expect(await outcome(load(at(ada, '/people/bo', { username: 'bo' })))).toEqual({
			status: 301,
			redirect: '/people/bo-chen'
		});
	});

	it('refuses a rename to a taken or malformed username, with a message', async () => {
		const { bo } = await world();
		expect(await rename(bo.session, 'ada')).toMatchObject({
			status: 400,
			data: { message: expect.stringContaining('taken') }
		});
		expect(await rename(bo.session, 'B o')).toMatchObject({ status: 400 });
	});

	it('is where the old member-id URL now goes', async () => {
		const { ada, bo } = await world();
		expect(
			await outcome(loadByMemberId(at(ada, `/members/${bo.memberId}`, { id: bo.memberId })))
		).toEqual({ status: 301, redirect: '/people/bo' });
	});
});

function post(who: SignedIn, username: string, action: string, fields: Record<string, string>) {
	const request = new Request(`https://campfire.test/people/${username}?/${action}`, {
		method: 'POST',
		body: new URLSearchParams(fields)
	});
	return { locals: who, params: { username }, url: new URL(request.url), request } as never;
}

describe('a status on the profile', () => {
	const lunch = { emoji: '🥪', text: 'Lunch', expiry: '1h' };

	it('is set by its owner and shown to everyone', async () => {
		const { ada, bo } = await world();
		await actions.status(post(bo.session, 'bo', 'status', lunch));
		const page = (await load(at(ada, '/people/bo', { username: 'bo' }))) as {
			person: { status: unknown };
		};
		expect(page.person.status).toMatchObject({ emoji: '🥪', text: 'Lunch' });

		await actions.clearStatus(post(bo.session, 'bo', 'clearStatus', {}));
		const cleared = (await load(at(ada, '/people/bo', { username: 'bo' }))) as {
			person: { status: unknown };
		};
		expect(cleared.person.status).toBeNull();
	});

	it('can’t be set on someone else’s profile', async () => {
		const { ada } = await world();
		expect(await outcome(actions.status(post(ada, 'bo', 'status', lunch)))).toEqual({
			status: 403
		});
	});

	it('answers a bad status with a message', async () => {
		const { bo } = await world();
		expect(
			await actions.status(post(bo.session, 'bo', 'status', { ...lunch, text: '' }))
		).toMatchObject({ status: 400, data: { message: expect.any(String) } });
	});
});
