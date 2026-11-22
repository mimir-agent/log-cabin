import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { createNote, setProjectShare } from '#lib/server/notes/notes.js';
import { createNoteComment } from '#lib/server/notes/discussion.js';
import { loadNote } from '#lib/server/notes/access.js';
import { loadProject } from '#lib/server/posts/access.js';
import { parseBody, type BodyInput } from '#lib/server/posts/posts.js';
import { setProjectArchived } from '#lib/server/posts/projects.js';
import { doc, postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { load } from './+page.server';

type Docs = { notes: { title: string }[]; canCreate: boolean };

async function docsWorld() {
	const w = await postsWorld();
	const ada = await w.person('Ada', 'member');
	const crew = await w.project(ada, 'Crew', true);
	const open = await w.project(ada, 'Open');
	const write = (who: SignedIn, title: string, projectId: string | null, at: number) =>
		createNote(w.env, who, { title, ...(parseBody(doc(title)) as BodyInput) }, projectId, at);
	const docs = async (who: SignedIn, projectId = crew) =>
		(await load(
			routeEvent(who, `/projects/${projectId}/docs`, { id: projectId }) as never
		)) as Docs;
	return { ...w, ada, crew, open, write, docs };
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

describe('a project’s Docs tab', () => {
	it('lists exactly the notes shared with the project, latest activity first', async () => {
		const w = await docsWorld();
		const bo = await w.person('Bo', 'member');
		await w.addTo(w.ada, w.crew, bo);
		const plan = await w.write(w.ada, 'Plan', w.crew, 1_000);
		await w.write(w.ada, 'Agenda', w.crew, 2_000);
		await w.write(w.ada, 'Elsewhere', w.open, 3_000);
		await w.write(w.ada, 'Private', null, 4_000);
		const unshared = await w.write(w.ada, 'Unshared', w.crew, 5_000);
		await setProjectShare(w.env, w.ada, await loadNote(w.env, w.ada, unshared), null);
		const comment = parseBody(doc('Updated')) as BodyInput;
		await createNoteComment(w.env, bo, await loadNote(w.env, bo, plan), comment, null, 6_000);

		const titles = (await w.docs(bo)).notes.map((n) => n.title);
		expect(titles, 'the comment brings Plan up').toEqual(['Plan', 'Agenda']);
	});

	it('is a 404 to someone outside a private project, guests included', async () => {
		const w = await docsWorld();
		await w.write(w.ada, 'Plan', w.crew, 1_000);
		for (const role of ['member', 'admin', 'viewer', 'guest'] as const) {
			const outsider = await w.person(`Out ${role}`, role);
			expect(await status(w.docs(outsider)), role).toBe(404);
		}
	});

	it('offers New note to people who can write in the project, not to a viewer', async () => {
		const w = await docsWorld();
		const [vic, gus] = [await w.person('Vic', 'viewer'), await w.person('Gus', 'guest')];
		await w.addTo(w.ada, w.crew, vic);
		await w.addTo(w.ada, w.crew, gus);
		await w.write(w.ada, 'Plan', w.crew, 1_000);
		const offered = async (who: SignedIn) => (await w.docs(who)).canCreate;
		expect(await offered(w.ada), 'a member').toBe(true);
		expect(await offered(gus), 'a guest in the project').toBe(true);
		expect(await offered(vic), 'a viewer').toBe(false);
		expect(
			(await w.docs(vic)).notes.map((n) => n.title),
			'a viewer still reads them'
		).toEqual(['Plan']);

		await setProjectArchived(w.env, w.ada, await loadProject(w.env, w.ada, w.crew), true);
		expect(await offered(w.ada), 'an archived project').toBe(false);
	});
});
