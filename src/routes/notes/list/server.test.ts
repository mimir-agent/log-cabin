import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import type { Role } from '#lib/server/db/schema/index.js';
import { upsertDevMember } from '#lib/server/dev-login.js';
import { suggestUsername } from '#lib/server/people/usernames.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { loadNote } from '#lib/server/notes/access.js';
import { createNote, shareWithPeople, validateNoteInput } from '#lib/server/notes/notes.js';
import { loadProject } from '#lib/server/posts/access.js';
import { addProjectMember, createProject } from '#lib/server/posts/projects.js';
import { GET } from './+server';

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
	const write = async (who: SignedIn, title: string, projectId: string | null = null, at = 0) => {
		const body = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
		const input = validateNoteInput({ title, body });
		if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
		return createNote(env, who, input.input, projectId, at || Date.now());
	};
	return { env, sqlite, person, write };
}

type Page = { notes: { id: string }[]; next: string | null };

async function page(who: SignedIn, params: Record<string, string>): Promise<Page> {
	const url = new URL(`https://campfire.test/notes/list?${new URLSearchParams(params)}`);
	const res = await GET({
		url,
		request: new Request(url),
		locals: { user: who.user, member: who.member }
	} as never);
	return res.json();
}

async function status(promise: Promise<unknown>): Promise<number | 'ok'> {
	try {
		await promise;
		return 'ok';
	} catch (e) {
		if (isHttpError(e)) return e.status;
		throw e;
	}
}

describe('the next pages of the notes index', () => {
	it('walks 120 visible notes 50 at a time, each once and in order, by either sort', async () => {
		const { env, sqlite, person, write } = await world();
		const [ada, bo] = [await person('Ada', 'member'), await person('Bo', 'member')];
		// Several notes share each time, so the id breaks the ties between pages.
		for (let i = 0; i < 100; i++) await write(ada, `Ada ${i}`, null, 1_000 + Math.floor(i / 3));
		for (let i = 0; i < 20; i++) {
			const id = await write(bo, `Bo ${i}`, null, 1_000 + i);
			await shareWithPeople(env, bo, await loadNote(env, bo, id), [ada.user.id], 'view');
		}
		for (let i = 0; i < 5; i++) await write(bo, `Bo’s own ${i}`);

		for (const [sort, column] of [
			['activity', 'last_activity_at'],
			['created', 'created_at']
		] as const) {
			const expected = sqlite
				.prepare(
					`SELECT id FROM notes WHERE title NOT LIKE 'Bo’s own%' ORDER BY ${column} DESC, id DESC`
				)
				.all()
				.map((row) => (row as { id: string }).id);
			const seen: string[] = [];
			const sizes: number[] = [];
			let cursor: string | null = '';
			while (cursor !== null) {
				const params: Record<string, string> = { sort, ...(cursor ? { cursor } : {}) };
				const next: Page = await page(ada, params);
				seen.push(...next.notes.map((n) => n.id));
				sizes.push(next.notes.length);
				cursor = next.next;
			}
			expect(sizes, `${sort}: pages of 50, then the rest`).toEqual([50, 50, 20]);
			expect(seen, `${sort}: every visible note once, in order`).toEqual(expected);
		}
	});

	it('gives a guest only the notes shared with them or with projects they’re in', async () => {
		const { env, person, write } = await world();
		const [ada, gus] = [await person('Ada', 'member'), await person('Gus', 'guest')];
		const crew = await createProject(env, ada, { name: 'Crew', description: '', private: true });
		const open = await createProject(env, ada, { name: 'Open', description: '', private: false });
		await addProjectMember(env, ada, await loadProject(env, ada, crew), gus.user.id);
		const inCrew = await write(ada, 'In Crew', crew);
		await write(ada, 'In Open', open);
		await write(ada, 'Private');
		const byName = await write(ada, 'For Gus');
		await shareWithPeople(env, ada, await loadNote(env, ada, byName), [gus.user.id], 'view');

		const all = await page(gus, {});
		expect(new Set(all.notes.map((n) => n.id))).toEqual(new Set([inCrew, byName]));
		expect((await page(gus, { filter: 'forMe' })).notes.map((n) => n.id)).toEqual([inCrew]);
	});

	it('refuses a cursor it didn’t make, and a private project’s docs to someone outside it', async () => {
		const { env, person } = await world();
		const [ada, bo] = [await person('Ada', 'member'), await person('Bo', 'member')];
		const crew = await createProject(env, ada, { name: 'Crew', description: '', private: true });
		expect(await status(page(ada, { cursor: 'yesterday' }))).toBe(400);
		expect(await status(page(bo, { project: crew }))).toBe(404);
		expect(await status(page(ada, { project: crew }))).toBe('ok');
	});
});
