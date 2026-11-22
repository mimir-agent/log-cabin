import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import type { Role } from '#lib/server/db/schema/index.js';
import { upsertDevMember } from '#lib/server/dev-login.js';
import { addProjectMember, createProject } from '#lib/server/posts/projects.js';
import { loadProject } from '#lib/server/posts/access.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { GET } from './+server';

async function world() {
	const { DB } = fakeD1();
	const env = { DB, JOBS: { send: async () => {} } } as unknown as Env;
	useTestEnv(env);
	const person = async (name: string, role: Role): Promise<SignedIn> => {
		const email = `${name.toLowerCase()}@example.com`;
		const id = await upsertDevMember(env, { email, name, role });
		const user = {
			id,
			name,
			username: name.toLowerCase(),
			email,
			avatarUrl: null,
			theme: 'system' as const
		};
		return { user, member: { id: `m-${id}`, role } };
	};
	const ada = await person('Ada', 'member');
	const gus = await person('Gus', 'guest');
	const vic = await person('Vic', 'viewer');
	const bo = await person('Bo', 'member');
	const trips = await createProject(env, ada, { name: 'Trips', description: '', private: false });
	await createProject(env, ada, { name: 'Ideas', description: '', private: false });
	const secret = await createProject(env, bo, { name: 'Secret', description: '', private: true });
	await addProjectMember(env, ada, await loadProject(env, ada, trips), gus.user.id);
	return { ada, gus, vic, trips, secret };
}

function get(who: SignedIn, projectId: string) {
	const url = new URL(`https://campfire.test/projects/${projectId}/composer`);
	const event = { request: new Request(url), params: { id: projectId }, locals: who, url };
	return Promise.resolve(GET(event as unknown as Parameters<typeof GET>[0])).catch((e) => e);
}

describe('GET /projects/[id]/composer', () => {
	it('gives the picker its projects and counts the guests who will see the post', async () => {
		const { ada, trips } = await world();
		const body = await (await get(ada, trips)).json();
		expect(body.project).toEqual({ id: trips, name: 'Trips' });
		expect(body.guests).toBe(1);
		expect(body.projects.map((p: { name: string }) => p.name)).toEqual(['Ideas', 'Trips']);
		expect(body.members.map((p: { name: string }) => p.name)).toContain('Gus');
	});

	it('refuses a viewer, and anyone who can’t see the project', async () => {
		const { ada, vic, trips, secret } = await world();
		expect(isHttpError(await get(vic, trips), 403)).toBe(true);
		expect(isHttpError(await get(ada, secret))).toBe(true);
	});
});
