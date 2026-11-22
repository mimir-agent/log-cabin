import { isHttpError, isRedirect } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { suggestUsername } from '#lib/server/people/usernames.js';
import { loadProject } from '#lib/server/posts/access.js';
import { addProjectMember, createProject } from '#lib/server/posts/projects.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { attachmentPath } from '#lib/editor/doc.js';
import { POST } from './+server';
import { POST as importPost } from './from-url/+server';
import { GET as download } from '../../../files/attachments/[id]/+server';
import { GET as publicDownload } from '../../../p/notes/[token]/files/[id]/+server';

async function world() {
	const { DB, sqlite } = fakeD1();
	sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Northwind', 0)");
	const objects = new Map<string, Blob>();
	const env = {
		DB,
		ATTACHMENT_MAX_MB: '1',
		BUCKET: {
			put: async (key: string, body: Blob) => void objects.set(key, body),
			get: async (key: string) =>
				objects.has(key)
					? { body: objects.get(key), httpMetadata: { contentType: objects.get(key)!.type } }
					: null
		},
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
	// Ada wrote the note; Bo may edit it and Cy may view it by name; Vic is a viewer with an
	// edit share; Eve may edit it through the Camp project; Dee is an admin nobody shared it with.
	const ada = await person('Ada', 'member');
	const bo = await person('Bo', 'member');
	const cy = await person('Cy', 'member');
	const dee = await person('Dee', 'admin');
	const eve = await person('Eve', 'member');
	const vic = await person('Vic', 'viewer');
	const note = async (title: string) => {
		const input = validateNoteInput({ title, body: '{"type":"doc","content":[]}' });
		if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
		return createNote(env, ada, input.input);
	};
	const noteId = await note('Hike plan');
	const otherNoteId = await note('Packing list');
	const loaded = await loadNote(env, ada, noteId);
	await shareWithPeople(env, ada, loaded, [bo.user.id, vic.user.id], 'edit');
	await shareWithPeople(env, ada, loaded, [cy.user.id], 'view');
	const camp = await createProject(env, ada, { name: 'Camp', description: '', private: true });
	await addProjectMember(env, ada, await loadProject(env, ada, camp), eve.user.id);
	await setProjectShare(env, ada, await loadNote(env, ada, noteId), {
		projectId: camp,
		permission: 'edit'
	});
	const setBody = (id: string, content: unknown[]) =>
		sqlite
			.prepare('UPDATE notes SET body = ? WHERE id = ?')
			.run(JSON.stringify({ type: 'doc', content }), id);
	const publish = async (on: boolean) => {
		await setNotePublic(env, await loadNote(env, ada, noteId), on);
		const row = sqlite.prepare('SELECT public_token AS t FROM notes WHERE id = ?').get(noteId);
		return (row as { t: string | null }).t;
	};
	return {
		env,
		sqlite,
		objects,
		ada,
		bo,
		cy,
		dee,
		eve,
		vic,
		noteId,
		otherNoteId,
		setBody,
		publish
	};
}

function upload(who: SignedIn | null, noteId: string, file: File) {
	const url = new URL(`https://campfire.test/notes/${noteId}/attachments`);
	const body = new FormData();
	body.set('file', file);
	const event = {
		request: new Request(url, { method: 'POST', body }),
		params: { id: noteId },
		locals: { user: who?.user ?? null, member: who?.member ?? null },
		url
	};
	return status(POST(event as unknown as Parameters<typeof POST>[0]));
}

async function status(response: Response | Promise<Response>): Promise<number> {
	try {
		return (await response).status;
	} catch (e) {
		if (isHttpError(e) || isRedirect(e)) return e.status;
		throw e;
	}
}

function read(who: SignedIn | null, id: string) {
	const url = new URL(`https://campfire.test/files/attachments/${id}`);
	const event = {
		request: new Request(url),
		params: { id },
		locals: { user: who?.user ?? null, member: who?.member ?? null },
		url
	};
	return status(download(event as unknown as Parameters<typeof download>[0]));
}

function readPublic(token: string, id: string) {
	return status(
		publicDownload({ params: { token, id } } as unknown as Parameters<typeof publicDownload>[0])
	);
}

const png = (name = 'shot.png') =>
	new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });

async function uploaded(who: SignedIn, noteId: string, file: File) {
	const url = new URL(`https://campfire.test/notes/${noteId}/attachments`);
	const body = new FormData();
	body.set('file', file);
	const response = await POST({
		request: new Request(url, { method: 'POST', body }),
		params: { id: noteId },
		locals: who,
		url
	} as unknown as Parameters<typeof POST>[0]);
	if (response.status !== 201) throw new Error(`expected 201, got ${response.status}`);
	return (await response.json()) as { id: string; name: string; contentType: string };
}

describe('POST /notes/[id]/attachments', () => {
	it('stores an upload from anyone who may edit the note and answers as the project upload does', async () => {
		const w = await world();
		for (const who of [w.ada, w.bo, w.eve]) {
			const file = await uploaded(who, w.noteId, png(`${who.user.name}.png`));
			expect(file, `${who.user.name}'s upload`).toMatchObject({
				name: `${who.user.name}.png`,
				size: 4,
				contentType: 'image/png'
			});
			expect(w.objects.has(`attachments/${file.id}`)).toBe(true);
			const row = w.sqlite
				.prepare('SELECT note_id, uploaded_by FROM note_attachments WHERE id = ?')
				.get(file.id);
			expect(row, 'recorded against the note').toEqual({
				note_id: w.noteId,
				uploaded_by: who.user.id
			});
		}
		const video = await uploaded(
			w.bo,
			w.noteId,
			new File(['v'], 'walk.mp4', { type: 'video/mp4' })
		);
		const pdf = await uploaded(
			w.bo,
			w.noteId,
			new File(['%PDF'], 'map.pdf', { type: 'application/pdf' })
		);
		expect([video.contentType, pdf.contentType]).toEqual(['video/mp4', 'application/pdf']);
	});

	it('refuses everyone who can only view the note, or can’t open it, and stores nothing', async () => {
		const w = await world();
		expect(await upload(w.cy, w.noteId, png()), 'a member with a view share').toBe(403);
		expect(await upload(w.vic, w.noteId, png()), 'a viewer, even with an edit share').toBe(403);
		expect(await upload(w.dee, w.noteId, png()), 'an admin it isn’t shared with').toBe(404);
		expect(await upload(w.bo, w.otherNoteId, png()), 'a note not shared with Bo').toBe(404);
		expect(await upload(null, w.noteId, png()), 'signed out: sent to sign in').toBe(303);
		expect(w.objects.size).toBe(0);
		expect(w.sqlite.prepare('SELECT * FROM note_attachments').all()).toEqual([]);
	});
});

describe('GET /files/attachments/[id] for a note’s file', () => {
	it('serves it to everyone who can open the note, viewers too, and 404s everyone else', async () => {
		const w = await world();
		const { id } = await uploaded(w.ada, w.noteId, png());
		for (const who of [w.ada, w.bo, w.cy, w.eve, w.vic]) {
			expect(await read(who, id), `${who.user.name} can open the note`).toBe(200);
		}
		expect(await read(w.dee, id), 'an admin it isn’t shared with').toBe(404);
		expect(await read(null, id), 'signed out: sent to sign in, no file').toBe(303);
		w.sqlite.prepare('DELETE FROM note_shares WHERE user_id = ?').run(w.cy.user.id);
		expect(await read(w.cy, id), 'once Cy’s share is gone').toBe(404);
	});
});

describe('GET /p/notes/[token]/files/[id]', () => {
	it('serves a file the public note’s body shows, as public post files are served', async () => {
		const w = await world();
		const image = await uploaded(w.ada, w.noteId, png());
		const pdf = await uploaded(
			w.ada,
			w.noteId,
			new File(['%PDF'], 'map.pdf', { type: 'application/pdf' })
		);
		const hidden = await uploaded(w.ada, w.noteId, png('later.png'));
		w.setBody(w.noteId, [
			{ type: 'image', attrs: { src: attachmentPath(image.id), alt: 'shot.png' } },
			{ type: 'attachment', attrs: { id: pdf.id, name: 'map.pdf', size: 4 } }
		]);
		const token = (await w.publish(true))!;
		const response = await publicDownload({ params: { token, id: image.id } } as never);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('content-security-policy')).toBe('sandbox');
		expect(await readPublic(token, pdf.id), 'a file node in the body').toBe(200);
		expect(await readPublic(token, hidden.id), 'uploaded but not in the body').toBe(404);
	});

	it('404s a file the body points at that was uploaded somewhere else', async () => {
		const w = await world();
		const elsewhere = await uploaded(w.ada, w.otherNoteId, png());
		w.setBody(w.noteId, [
			{ type: 'image', attrs: { src: attachmentPath(elsewhere.id), alt: 'shot.png' } }
		]);
		const token = (await w.publish(true))!;
		expect(await readPublic(token, elsewhere.id)).toBe(404);
	});

	it('404s the note’s files once it is taken down', async () => {
		const w = await world();
		const image = await uploaded(w.ada, w.noteId, png());
		w.setBody(w.noteId, [
			{ type: 'image', attrs: { src: attachmentPath(image.id), alt: 'shot.png' } }
		]);
		const token = (await w.publish(true))!;
		expect(await readPublic(token, image.id)).toBe(200);
		await w.publish(false);
		expect(await readPublic(token, image.id)).toBe(404);
	});
});

/** Stubs fetch with these answers, in order, and returns the mock. */
function answers(...responses: (Response | Error)[]) {
	const fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => {
		const next = responses.shift();
		if (!next) throw new Error('fetch called more often than the test expected');
		if (next instanceof Error) throw next;
		return next;
	});
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

const image = (type = 'image/png', bytes: BlobPart = new Uint8Array([137, 80, 78, 71])) =>
	new Response(new Blob([bytes]), { headers: { 'content-type': type } });

function importFrom(who: SignedIn | null, noteId: string, address: string) {
	const url = new URL(`https://campfire.test/notes/${noteId}/attachments/from-url`);
	return importPost({
		request: new Request(url, { method: 'POST', body: JSON.stringify({ url: address }) }),
		params: { id: noteId },
		locals: { user: who?.user ?? null, member: who?.member ?? null },
		url
	} as unknown as Parameters<typeof importPost>[0]);
}

describe('POST /notes/[id]/attachments/from-url', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('fetches a pasted image into the note for an editor and answers as an upload does', async () => {
		const w = await world();
		const fetch = answers(
			new Response(null, { status: 302, headers: { location: '/img/tent.png' } }),
			image('image/png; charset=binary')
		);
		const response = await importFrom(w.bo, w.noteId, 'https://maps.example/tent');
		expect(response.status).toBe(201);
		const file = (await response.json()) as { id: string };
		expect(file).toMatchObject({ name: 'tent.png', size: 4, contentType: 'image/png' });
		expect(String(fetch.mock.calls[1][0]), 'followed the redirect').toBe(
			'https://maps.example/img/tent.png'
		);
		expect(w.objects.has(`attachments/${file.id}`), 'its bytes stored').toBe(true);
		const row = w.sqlite
			.prepare('SELECT note_id, uploaded_by FROM note_attachments WHERE id = ?')
			.get(file.id);
		expect(row, 'recorded against the note').toEqual({
			note_id: w.noteId,
			uploaded_by: w.bo.user.id
		});
		expect(await read(w.cy, file.id), 'shown to whoever can open the note').toBe(200);
	});

	it('refuses everyone who can only view the note, or can’t open it, before fetching anything', async () => {
		const w = await world();
		const fetch = answers();
		const address = 'https://maps.example/a.png';
		expect(await status(importFrom(w.cy, w.noteId, address)), 'a view share').toBe(403);
		expect(await status(importFrom(w.vic, w.noteId, address)), 'a viewer').toBe(403);
		expect(
			await status(importFrom(w.dee, w.noteId, address)),
			'an admin it isn’t shared with'
		).toBe(404);
		expect(await status(importFrom(null, w.noteId, address)), 'signed out').toBe(303);
		expect(fetch).not.toHaveBeenCalled();
		expect(w.sqlite.prepare('SELECT * FROM note_attachments').all()).toEqual([]);
	});

	it('refuses private hosts, as written or redirected to, and what can’t be fetched, with 400', async () => {
		const w = await world();
		answers(
			new Response(null, { status: 301, headers: { location: 'http://10.0.0.5/a.png' } }),
			new Response('gone', { status: 404 }),
			new TypeError('network down')
		);
		for (const address of [
			'http://127.0.0.1/a.png',
			'http://localhost/a.png',
			'https://campfire.internal/a.png',
			'file:///etc/passwd',
			'not a url',
			'https://maps.example/moved.png',
			'https://maps.example/gone.png',
			'https://maps.example/down.png'
		]) {
			expect(await status(importFrom(w.bo, w.noteId, address)), address).toBe(400);
		}
		expect(w.objects.size, 'nothing stored').toBe(0);
	});

	it('refuses anything but an image that uploads take with 415', async () => {
		const w = await world();
		answers(
			image('text/html', '<html>'),
			image('application/pdf', '%PDF'),
			image('image/svg+xml', '<svg/>')
		);
		for (const kind of ['a page', 'a PDF', 'an SVG, which could run script']) {
			expect(await status(importFrom(w.bo, w.noteId, 'https://maps.example/a')), kind).toBe(415);
		}
		expect(w.objects.size, 'nothing stored').toBe(0);
	});

	it('refuses an image past the upload limit with 413, whether or not it says its size', async () => {
		const w = await world();
		const big = new Uint8Array(1024 * 1024 + 1);
		answers(
			new Response(new Blob([big]), {
				headers: { 'content-type': 'image/png', 'content-length': String(big.byteLength) }
			}),
			new Response(new ReadableStream({ start: (c) => (c.enqueue(big), c.close()) }), {
				headers: { 'content-type': 'image/png' }
			})
		);
		expect(await status(importFrom(w.bo, w.noteId, 'https://maps.example/a.png')), 'said').toBe(
			413
		);
		expect(await status(importFrom(w.bo, w.noteId, 'https://maps.example/b.png')), 'unsaid').toBe(
			413
		);
		expect(w.objects.size, 'nothing stored').toBe(0);
	});
});
