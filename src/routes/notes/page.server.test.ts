import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import type { Role } from '#lib/server/db/schema/index.js';
import { upsertDevMember } from '#lib/server/dev-login.js';
import { suggestUsername } from '#lib/server/people/usernames.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { actions, load } from './+page.server';

async function world() {
	const { DB, sqlite } = fakeD1();
	sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Log Cabin', 0)");
	const env = { DB, JOBS: { send: async () => {} } } as unknown as Env;
	useTestEnv(env);
	const person = async (name: string, role: Role): Promise<SignedIn> => {
		const email = `${name.toLowerCase()}@example.com`;
		const id = await upsertDevMember(env, { email, name, role });
		return {
			user: { id, name, username: suggestUsername(name), email, avatarUrl: null, theme: 'system' },
			member: { id: `m-${id}`, role }
		};
	};
	return { person };
}

function event(who: SignedIn, fields: Record<string, string> = {}) {
	const url = new URL('https://campfire.test/notes');
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);
	return {
		request: new Request(url, { method: 'POST', body }),
		locals: { user: who.user, member: who.member },
		url
	} as never;
}

const layoutOf = async (who: SignedIn) => ((await load(event(who))) as { layout: string }).layout;

describe('the notes index layout', () => {
	it('keeps the layout someone chose through a reload and a new session, for them alone', async () => {
		const { person } = await world();
		const [ada, bo] = [await person('Ada', 'member'), await person('Bo', 'viewer')];
		expect(await layoutOf(ada), 'a list until chosen').toBe('list');

		await actions.layout(event(ada, { layout: 'grid' }));
		expect(await layoutOf(ada), 'after a reload').toBe('grid');
		const signedInAgain = await person('Ada', 'member');
		expect(await layoutOf(signedInAgain), 'in a new session').toBe('grid');
		expect(await layoutOf(bo), 'someone else').toBe('list');

		await actions.layout(event(bo, { layout: 'grid' }));
		expect(await layoutOf(bo), 'a viewer chooses too').toBe('grid');
	});

	it('refuses a layout that isn’t list or grid', async () => {
		const { person } = await world();
		const ada = await person('Ada', 'member');
		for (const fields of [{ layout: 'table' }, {}] as Record<string, string>[]) {
			expect(await actions.layout(event(ada, fields)), JSON.stringify(fields)).toMatchObject({
				status: 400
			});
		}
		expect(await layoutOf(ada)).toBe('list');
	});
});
