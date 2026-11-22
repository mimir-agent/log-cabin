import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { createMember, getMember, listMembers } from '#lib/server/members.js';
import { getOrg } from '#lib/server/org.js';
import { createProject, listProjects } from '#lib/server/posts/projects.js';
import { createOrgAndAdmin } from '#lib/server/setup.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import type { Role } from '#lib/server/db/schema/index.js';
import { actions, load } from './+page.server';
import { load as loadHome } from '../+page.server';

const origin = 'https://campfire.test';

async function world() {
	const { DB, sqlite } = fakeD1();
	const env = {
		DB,
		EMAIL_TRANSPORT: 'log',
		EMAIL_FROM: 'Campfire <c@example.com>'
	} as unknown as Env;
	useTestEnv(env);
	await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@acme.test' });
	const signedIn = async (memberId: string): Promise<SignedIn> => {
		const m = (await getMember(env, memberId))!;
		return {
			user: {
				id: m.userId,
				name: m.name,
				username: m.username,
				email: m.email,
				avatarUrl: null,
				theme: 'system'
			},
			member: { id: m.id, role: m.role }
		};
	};
	const ada = await signedIn(
		(await listMembers(env, { query: 'Ada', includeDeactivated: false }))[0].id
	);
	const join = async (name: string, role: Role) => {
		const { memberId } = await createMember(
			env,
			{ email: `${name.toLowerCase()}@acme.test`, name, role },
			Date.now() + 1000
		);
		return signedIn(memberId);
	};
	const mails = () => sqlite.prepare('SELECT to_address FROM dev_mail').all();
	return { env, ada, join, signedIn, mails };
}

function event(
	who: SignedIn,
	path = '/onboarding',
	fields: Record<string, string | string[] | File> = {}
) {
	const url = new URL(`${origin}${path}`);
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		for (const v of [value].flat()) body.append(key, v);
	}
	return {
		locals: who,
		url,
		request: new Request(url, { method: 'POST', body })
	} as unknown as Parameters<typeof load>[0] & Parameters<(typeof actions)['continue']>[0];
}

async function thrown(promise: unknown) {
	try {
		await promise;
	} catch (e) {
		return e;
	}
	throw new Error('expected a redirect, but the call returned normally');
}

/** Where a load or action redirects to. */
async function redirectOf(promise: unknown) {
	const e = await thrown(promise);
	if (!isRedirect(e)) throw e;
	return e.location;
}

type Step = { step: string; position: number; count: number };
const stepOf = async (who: SignedIn) => (await load(event(who))) as unknown as Step;

describe('onboarding', () => {
	it('opens after a new member’s first sign-in, and walks them through their steps', async () => {
		const { env, ada, join } = await world();
		const sam = await join('Sam', 'member');
		const design = await createProject(env, ada, {
			name: 'Design',
			description: '',
			private: false
		});

		expect(await redirectOf(loadHome(event(sam, '/') as never))).toBe('/onboarding');
		expect(await stepOf(sam)).toMatchObject({ step: 'profile', position: 1, count: 2 });

		expect(
			await redirectOf(
				actions.continue(
					event(sam, '/onboarding?/continue', { name: 'Sam Ray', username: 'samray' })
				)
			)
		).toBe('/onboarding');
		expect(await getMember(env, sam.member.id)).toMatchObject({
			name: 'Sam Ray',
			username: 'samray'
		});
		expect(await stepOf(sam)).toMatchObject({ step: 'projects', position: 2 });

		expect(
			await redirectOf(actions.continue(event(sam, '/onboarding?/continue', { project: design })))
		).toBe('/');
		expect(
			(await listProjects(env, sam, false)).filter((p) => p.isMember).map((p) => p.name)
		).toEqual(['Design']);
		expect(await redirectOf(load(event(sam))), 'finished onboarding doesn’t open again').toBe('/');
		expect(await loadHome(event(sam, '/') as never)).toMatchObject({ onboarding: false });
	});

	it('with a refused avatar changes nothing on the profile step, the username included', async () => {
		const { env, join } = await world();
		const sam = await join('Sam', 'member');
		await stepOf(sam);
		const text = new File(['hi'], 'avatar.txt', { type: 'text/plain' });

		const saved = await actions.continue(
			event(sam, '/onboarding?/continue', { name: 'Sam Ray', username: 'samray', avatar: text })
		);

		expect(saved).toMatchObject({ status: 400, data: { field: 'avatar' } });
		expect(await getMember(env, sam.member.id)).toMatchObject({ name: 'Sam', username: 'sam' });
		expect(await stepOf(sam)).toMatchObject({ step: 'profile' });
	});

	it('names the field each refusal belongs under, so the page can show it there', async () => {
		const { ada, join } = await world();
		const sam = await join('Sam', 'member');
		await stepOf(sam);
		const cont = (who: SignedIn, fields: Record<string, string>) =>
			actions.continue(event(who, '/onboarding?/continue', fields));

		expect(await cont(sam, { name: ' ', username: 'sam' })).toMatchObject({
			status: 400,
			data: { field: 'name', message: expect.any(String), typed: { name: ' ', username: 'sam' } }
		});
		expect(await cont(sam, { name: 'Sam', username: 'no spaces' })).toMatchObject({
			data: { field: 'username' }
		});
		await stepOf(ada);
		expect(await cont(ada, { domain: 'not a domain', domainJoin: 'direct' })).toMatchObject({
			data: { field: 'domain' }
		});
	});

	it('resumes where they left off, in a later session, with a reminder on Home', async () => {
		const { join } = await world();
		const sam = await join('Sam', 'member');
		await stepOf(sam);
		await redirectOf(actions.skip(event(sam, '/onboarding?/skip')));

		// Nothing about where they were lives in the browser: a new session reads it back.
		expect(
			await loadHome(event(sam, '/') as never),
			'Home no longer redirects once onboarding has been opened'
		).toMatchObject({ onboarding: true });
		expect(await stepOf(sam)).toMatchObject({ step: 'projects' });

		expect(await redirectOf(actions.back(event(sam, '/onboarding?/back')))).toBe(
			'/onboarding?back'
		);
		expect(await stepOf(sam)).toMatchObject({ step: 'profile' });

		expect(await redirectOf(actions.dismiss(event(sam, '/onboarding?/dismiss')))).toBe('/');
		expect(await loadHome(event(sam, '/') as never)).toMatchObject({ onboarding: false });
	});

	it('gives the org’s first admin the org steps first, and an invite step last', async () => {
		const { env, ada, mails } = await world();

		expect(await stepOf(ada)).toMatchObject({ step: 'org', position: 1, count: 4 });
		await redirectOf(
			actions.continue(
				event(ada, '/onboarding?/continue', { domain: 'acme.test', domainJoin: 'request' })
			)
		);
		expect(await getOrg(env)).toMatchObject({
			allowedEmailDomain: 'acme.test',
			domainJoin: 'request'
		});

		await redirectOf(actions.skip(event(ada, '/onboarding?/skip')));
		await redirectOf(actions.skip(event(ada, '/onboarding?/skip')));
		expect(await stepOf(ada)).toMatchObject({ step: 'invite', position: 4 });
		expect(
			await redirectOf(
				actions.continue(
					event(ada, '/onboarding?/continue', {
						emails: 'bo@acme.test, cy@acme.test',
						role: 'member'
					})
				)
			)
		).toBe('/');
		expect(mails()).toEqual([{ to_address: 'bo@acme.test' }, { to_address: 'cy@acme.test' }]);
	});

	it('keeps the org steps for the first admin only, invites for admins only, and projects from guests', async () => {
		const { join } = await world();

		expect(await stepOf(await join('Ann', 'admin'))).toMatchObject({ step: 'profile', count: 3 });
		expect(await stepOf(await join('Vic', 'viewer'))).toMatchObject({ count: 2 });
		expect(await stepOf(await join('Gus', 'guest'))).toMatchObject({ step: 'profile', count: 1 });
	});
});
