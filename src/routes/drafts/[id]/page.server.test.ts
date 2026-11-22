import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import type { Role } from '#lib/server/db/schema/index.js';
import { upsertDevMember } from '#lib/server/dev-login.js';
import { suggestUsername } from '#lib/server/people/usernames.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { feed } from '#lib/server/posts/posts.js';
import { createProject } from '#lib/server/posts/projects.js';
import { search } from '#lib/server/search/search.js';
import { POST as createDraft } from '../+server';
import { load as loadDrafts } from '../+page.server';
import { PUT as saveDraft } from './+server';
import { actions, load } from './+page.server';

const doc = (text: string) =>
	JSON.stringify({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});

async function world() {
	const { DB, sqlite } = fakeD1();
	sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Campfire', 0)");
	const env = {
		DB,
		JOBS: { send: async () => {} },
		REALTIME: {
			idFromName: (topic: string) => topic,
			get: () => ({ fetch: async () => new Response(null, { status: 204 }) })
		}
	} as unknown as Env;
	useTestEnv(env);
	const person = async (name: string, role: Role): Promise<SignedIn> => {
		const email = `${name.toLowerCase()}@example.com`;
		const id = await upsertDevMember(env, { email, name, role });
		return {
			user: { id, name, username: suggestUsername(name), email, avatarUrl: null, theme: 'system' },
			member: { id: `m-${id}`, role }
		};
	};
	const ada = await person('Ada', 'member');
	const bo = await person('Bo', 'member');
	const projectId = await createProject(env, ada, {
		name: 'Trips',
		description: '',
		private: false
	});
	return { env, ada, bo, projectId };
}

function request(who: SignedIn, path: string, init: RequestInit, id = '') {
	const url = new URL(`https://campfire.test${path}`);
	return {
		request: new Request(url, init),
		params: { id },
		locals: { user: who.user, member: who.member },
		url
	} as never;
}

const form = (fields: Record<string, string>) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	return { method: 'POST', body };
};

async function caught(promise: unknown): Promise<unknown> {
	return Promise.resolve(promise).catch((e: unknown) => e);
}

describe('drafts', () => {
	async function draftByAda() {
		const w = await world();
		const created = await createDraft(
			request(w.ada, '/drafts', {
				method: 'POST',
				body: JSON.stringify({
					projectId: w.projectId,
					title: 'Zephyrquartz trip',
					body: doc('Half')
				})
			})
		);
		expect(created.status).toBe(201);
		const { id } = (await created.json()) as { id: string };
		return { ...w, id };
	}

	it('keeps the latest autosave and opens it again on the Drafts page', async () => {
		const { ada, id } = await draftByAda();
		const saved = await saveDraft(
			request(
				ada,
				`/drafts/${id}`,
				{ method: 'PUT', body: JSON.stringify({ title: 'Zephyrquartz trip', body: doc('Whole') }) },
				id
			)
		);
		expect(saved.status).toBe(200);
		const list = (await loadDrafts(request(ada, '/drafts', { method: 'GET' }))) as {
			drafts: { id: string; title: string }[];
		};
		expect(list.drafts).toMatchObject([{ id, title: 'Zephyrquartz trip' }]);
		const page = (await load(request(ada, `/drafts/${id}`, { method: 'GET' }, id))) as {
			draft: { body: unknown };
		};
		expect(JSON.stringify(page.draft.body)).toContain('Whole');
	});

	it('moves to the project picked in the composer, only one its author can post in', async () => {
		const { env, ada, bo, id } = await draftByAda();
		const save = (projectId: string) =>
			saveDraft(
				request(
					ada,
					`/drafts/${id}`,
					{ method: 'PUT', body: JSON.stringify({ projectId, title: 'Trip', body: doc('x') }) },
					id
				)
			);
		const ideas = await createProject(env, ada, { name: 'Ideas', description: '', private: false });
		expect((await save(ideas)).status).toBe(200);
		const secret = await createProject(env, bo, { name: 'Secret', description: '', private: true });
		expect(isHttpError(await caught(save(secret)))).toBe(true);
		const list = (await loadDrafts(request(ada, '/drafts', { method: 'GET' }))) as {
			drafts: { projectName: string }[];
		};
		expect(list.drafts).toMatchObject([{ projectName: 'Ideas' }]);
	});

	it('is invisible to everyone else: not listed, not openable, not savable, not in feed or search', async () => {
		const { env, bo, id } = await draftByAda();
		const list = (await loadDrafts(request(bo, '/drafts', { method: 'GET' }))) as {
			drafts: unknown[];
		};
		expect(list.drafts).toEqual([]);
		expect(
			isHttpError(await caught(load(request(bo, `/drafts/${id}`, { method: 'GET' }, id))), 404)
		).toBe(true);
		const put = request(
			bo,
			`/drafts/${id}`,
			{ method: 'PUT', body: JSON.stringify({ title: 'Mine', body: doc('x') }) },
			id
		);
		expect(isHttpError(await caught(saveDraft(put)), 404)).toBe(true);
		expect((await feed(env, bo, {})).items).toEqual([]);
		expect(await search(env, bo, 'zephyrquartz', { limit: 10 })).toEqual([]);
	});

	it('publishes into the project feed and stops being a draft', async () => {
		const { env, ada, bo, id } = await draftByAda();
		const published = await caught(
			actions.publish(request(ada, `/drafts/${id}`, form({ title: 'Trip', body: doc('Go') }), id))
		);
		expect(isRedirect(published)).toBe(true);
		expect((await feed(env, bo, {})).items.map((p) => p.title)).toEqual(['Trip']);
		const list = (await loadDrafts(request(ada, '/drafts', { method: 'GET' }))) as {
			drafts: unknown[];
		};
		expect(list.drafts).toEqual([]);
	});

	it('won’t let someone else publish it', async () => {
		const { env, bo, id } = await draftByAda();
		const e = await caught(
			actions.publish(request(bo, `/drafts/${id}`, form({ title: 'Trip', body: doc('Go') }), id))
		);
		expect(isHttpError(e, 404)).toBe(true);
		expect((await feed(env, bo, {})).items).toEqual([]);
	});
});
