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
import { setNotePublic } from '#lib/server/notes/public.js';
import { refreshThumbnail, type RenderThumbnails } from '#lib/server/notes/thumbnails.js';
import { suggestUsername } from '#lib/server/people/usernames.js';
import { loadProject } from '#lib/server/posts/access.js';
import { addProjectMember, createProject } from '#lib/server/posts/projects.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { fakeBucket } from '#lib/server/testing/fake-durable-object.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { GET } from './+server';
import { GET as publicGET } from '../../../p/notes/[token]/og.png/+server';
import { load as publicLoad } from '../../../p/notes/[token]/+page.server';

/** Stands in for the renderer: each size's "PNG" names the size. */
const render: RenderThumbnails = async () => ({
	og: new TextEncoder().encode('og'),
	grid: new TextEncoder().encode('grid')
});

async function world() {
	const { DB, sqlite } = fakeD1();
	sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Northwind', 0)");
	const { bucket } = fakeBucket();
	const env = {
		DB,
		BUCKET: bucket,
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
	// Ada wrote the note; Bo may edit it and Cy may view it by name; Vic is a viewer with a view
	// share; Eve sees it through the Camp project; Dee is an admin and Fay a member nobody shared
	// it with; Gus is a guest outside Camp.
	const ada = await person('Ada', 'member');
	const bo = await person('Bo', 'member');
	const cy = await person('Cy', 'member');
	const dee = await person('Dee', 'admin');
	const eve = await person('Eve', 'member');
	const fay = await person('Fay', 'member');
	const vic = await person('Vic', 'viewer');
	const gus = await person('Gus', 'guest');
	const input = validateNoteInput({ title: 'Hike plan', body: '{"type":"doc","content":[]}' });
	if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
	const noteId = await createNote(env, ada, input.input);
	const note = () => loadNote(env, ada, noteId);
	await shareWithPeople(env, ada, await note(), [bo.user.id], 'edit');
	await shareWithPeople(env, ada, await note(), [cy.user.id, vic.user.id], 'view');
	const camp = await createProject(env, ada, { name: 'Camp', description: '', private: true });
	await addProjectMember(env, ada, await loadProject(env, ada, camp), eve.user.id);
	await setProjectShare(env, ada, await note(), { projectId: camp, permission: 'view' });
	const publish = async (on: boolean) => {
		await setNotePublic(env, await note(), on);
		const row = sqlite.prepare('SELECT public_token AS t FROM notes WHERE id = ?').get(noteId);
		return (row as { t: string | null }).t;
	};
	const draw = () => refreshThumbnail(env, noteId, render);
	return { env, sqlite, ada, bo, cy, dee, eve, fay, vic, gus, noteId, publish, draw };
}

type Outcome = { status: number; body?: string; cacheControl?: string | null };

async function outcome(response: Response | Promise<Response>): Promise<Outcome> {
	try {
		const r = await response;
		return { status: r.status, body: await r.text(), cacheControl: r.headers.get('cache-control') };
	} catch (e) {
		if (isHttpError(e) || isRedirect(e)) return { status: e.status };
		throw e;
	}
}

function thumbnail(who: SignedIn | null, noteId: string, size = 'grid') {
	const url = new URL(`https://campfire.test/notes/${noteId}/thumbnail?size=${size}&v=1`);
	const event = {
		request: new Request(url),
		params: { id: noteId },
		locals: { user: who?.user ?? null, member: who?.member ?? null },
		url
	};
	return outcome(GET(event as unknown as Parameters<typeof GET>[0]));
}

function publicThumbnail(token: string) {
	return outcome(publicGET({ params: { token } } as unknown as Parameters<typeof publicGET>[0]));
}

async function publicPage(token: string) {
	const url = new URL(`https://campfire.test/p/notes/${token}`);
	const data = await publicLoad({
		params: { token },
		url,
		locals: { user: null, member: null },
		setHeaders: () => {}
	} as unknown as Parameters<typeof publicLoad>[0]);
	return data as { ogImage: { url: string; width: number; height: number } | null };
}

describe('GET /notes/[id]/thumbnail', () => {
	it('serves either size to everyone who can open the note, privately for five minutes', async () => {
		const w = await world();
		await w.draw();
		for (const who of [w.ada, w.bo, w.cy, w.vic, w.eve]) {
			expect(await thumbnail(who, w.noteId), `${who.user.name}, grid`).toEqual({
				status: 200,
				body: 'grid',
				cacheControl: 'private, max-age=300'
			});
		}
		expect((await thumbnail(w.cy, w.noteId, 'og')).body, 'the link-preview size').toBe('og');
	});

	it('is 404 to everyone who can’t open the note, and sends the signed out to sign in', async () => {
		const w = await world();
		await w.draw();
		expect(await thumbnail(w.dee, w.noteId), 'an admin it isn’t shared with').toEqual({
			status: 404
		});
		expect(await thumbnail(w.fay, w.noteId), 'a member it isn’t shared with').toEqual({
			status: 404
		});
		expect(await thumbnail(w.gus, w.noteId), 'a guest outside its project').toEqual({
			status: 404
		});
		expect(await thumbnail(null, w.noteId), 'signed out: sent to sign in').toEqual({
			status: 303
		});
	});

	it('is 404 before a thumbnail is drawn, and for a size there isn’t', async () => {
		const w = await world();
		expect(await thumbnail(w.ada, w.noteId), 'nothing drawn yet').toEqual({ status: 404 });
		await w.draw();
		expect(await thumbnail(w.ada, w.noteId, 'huge'), 'no such size').toEqual({ status: 404 });
	});

	it('never serves a private note’s thumbnail signed out, even once it was published', async () => {
		const w = await world();
		await w.draw();
		const token = await w.publish(true);
		await w.publish(false);
		expect(await thumbnail(null, w.noteId)).toEqual({ status: 303 });
		expect(await publicThumbnail(token!), 'the old public link').toEqual({ status: 404 });
	});
});

describe('GET /p/notes/[token]/og.png', () => {
	it('serves a published note’s link preview signed out, cached publicly for a minute', async () => {
		const w = await world();
		await w.draw();
		const token = (await w.publish(true))!;
		expect(await publicThumbnail(token)).toEqual({
			status: 200,
			body: 'og',
			cacheControl: 'public, max-age=60'
		});
		expect((await publicPage(token)).ogImage, 'the page names it as og:image').toEqual({
			url: `https://campfire.test/p/notes/${token}/og.png`,
			width: 1200,
			height: 630
		});
	});

	it('is 404 when the note is taken down or the org turns public links off', async () => {
		const w = await world();
		await w.draw();
		const disabled = (await w.publish(true))!;
		await w.publish(false);
		expect(await publicThumbnail(disabled), 'taken down').toEqual({ status: 404 });
		const token = (await w.publish(true))!;
		w.sqlite.exec('UPDATE org SET public_posts = 0');
		expect(await publicThumbnail(token), 'public links off').toEqual({ status: 404 });
	});

	it('is 404, and the page names no og:image, before a thumbnail is drawn', async () => {
		const w = await world();
		const token = (await w.publish(true))!;
		expect(await publicThumbnail(token)).toEqual({ status: 404 });
		expect((await publicPage(token)).ogImage).toBeNull();
	});
});
