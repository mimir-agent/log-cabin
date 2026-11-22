import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import type { Role } from '#lib/server/db/schema/index.js';
import { upsertDevMember } from '#lib/server/dev-login.js';
import { loadNote } from '#lib/server/notes/access.js';
import {
	createNote,
	setProjectShare,
	shareWithPeople,
	validateNoteInput
} from '#lib/server/notes/notes.js';
import { suggestUsername } from '#lib/server/people/usernames.js';
import { loadProject } from '#lib/server/posts/access.js';
import { addProjectMember, createProject } from '#lib/server/posts/projects.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { GET } from './+server';

async function world() {
	const { DB, sqlite } = fakeD1();
	sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Northwind', 0)");
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
	// Ada wrote the note; Cy may view it by name; Eve sees it through the Camp project; Dee is
	// an admin and Fay a member nobody shared it with; Gus is a guest outside Camp.
	const ada = await person('Ada', 'member');
	const cy = await person('Cy', 'member');
	const dee = await person('Dee', 'admin');
	const eve = await person('Eve', 'member');
	const fay = await person('Fay', 'member');
	const gus = await person('Gus', 'guest');
	const input = validateNoteInput({ title: 'Hike plan', body: '{"type":"doc","content":[]}' });
	if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
	const noteId = await createNote(env, ada, input.input);
	const note = () => loadNote(env, ada, noteId);
	await shareWithPeople(env, ada, await note(), [cy.user.id], 'view');
	const camp = await createProject(env, ada, { name: 'Camp', description: '', private: true });
	await addProjectMember(env, ada, await loadProject(env, ada, camp), eve.user.id);
	await setProjectShare(env, ada, await note(), { projectId: camp, permission: 'view' });
	return { sqlite, ada, cy, dee, eve, fay, gus, noteId };
}

async function card(who: SignedIn | null, noteId: string) {
	const url = new URL(`https://campfire.test/notes/${noteId}/card`);
	const event = {
		request: new Request(url),
		params: { id: noteId },
		locals: { user: who?.user ?? null, member: who?.member ?? null },
		url
	};
	try {
		const response = await GET(event as unknown as Parameters<typeof GET>[0]);
		return { status: response.status, body: await response.json() };
	} catch (e) {
		if (isHttpError(e) || isRedirect(e)) return { status: e.status };
		throw e;
	}
}

describe('GET /notes/[id]/card', () => {
	it('gives the title, author, last update and thumbnail version to everyone who can open the note', async () => {
		const w = await world();
		w.sqlite
			.prepare('UPDATE notes SET updated_at = 1700000000000, thumbnail_version = 3 WHERE id = ?')
			.run(w.noteId);
		for (const who of [w.ada, w.cy, w.eve]) {
			expect(await card(who, w.noteId), `${who.user.name} can open the note`).toEqual({
				status: 200,
				body: {
					title: 'Hike plan',
					authorName: 'Ada',
					updatedAt: 1700000000000,
					thumbnailVersion: 3
				}
			});
		}
	});

	it('is 404, with nothing about the note, to everyone who can’t open it', async () => {
		const w = await world();
		expect(await card(w.dee, w.noteId), 'an admin it isn’t shared with').toEqual({ status: 404 });
		expect(await card(w.fay, w.noteId), 'a member it isn’t shared with').toEqual({ status: 404 });
		expect(await card(w.gus, w.noteId), 'a guest outside its project').toEqual({ status: 404 });
		expect(await card(w.ada, 'nope'), 'a note that doesn’t exist').toEqual({ status: 404 });
	});

	it('sends the signed out to sign in', async () => {
		const w = await world();
		expect(await card(null, w.noteId)).toEqual({ status: 303 });
	});
});
