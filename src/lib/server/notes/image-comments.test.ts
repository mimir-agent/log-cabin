import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import { upsertDevMember } from '../dev-login';
import { suggestUsername } from '../people/usernames';
import { fakeD1 } from '../testing/fake-d1';
import { useTestEnv } from '../testing/env';
import { loadNote } from './access';
import { createNoteComment, listNoteComments, pinNoteComment } from './discussion';
import { createNote, shareWithPeople, validateNoteInput } from './notes';

const body = (text: string) => ({
	body: JSON.stringify({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	}),
	bodyText: text,
	mentions: []
});

async function world() {
	const { DB, sqlite } = fakeD1();
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
	// Ada wrote both notes; Bo and Vic, a viewer, may view the first.
	const ada = await person('Ada', 'member');
	const bo = await person('Bo', 'member');
	const vic = await person('Vic', 'viewer');
	const note = async (title: string) => {
		const input = validateNoteInput({ title, body: '{"type":"doc","content":[]}' });
		if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
		return createNote(env, ada, input.input);
	};
	const noteId = await note('Hike plan');
	const otherId = await note('Packing list');
	await shareWithPeople(
		env,
		ada,
		await loadNote(env, ada, noteId),
		[bo.user.id, vic.user.id],
		'view'
	);
	const file = (id: string, onNote: string, contentType: string) =>
		sqlite
			.prepare(
				`INSERT INTO note_attachments (id, note_id, uploaded_by, name, content_type, size, created_at)
				VALUES (?, ?, ?, ?, ?, 4, 0)`
			)
			.run(id, onNote, ada.user.id, id, contentType);
	file('map', noteId, 'image/png');
	file('route', noteId, 'application/pdf');
	file('tent', otherId, 'image/png');
	const pin = async (who: SignedIn, attachmentId: string, x = 0.25, y = 0.75) =>
		pinNoteComment(
			env,
			who,
			await loadNote(env, who, noteId),
			{ attachmentId, x, y },
			body('Here')
		);
	return { env, ada, bo, vic, noteId, pin };
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

describe('comments pinned to a point on a note’s image', () => {
	it('lets anyone who may comment on the note pin one to its own image, listed with the point', async () => {
		const w = await world();
		await w.pin(w.bo, 'map', 0.25, 0.75);
		const [comment] = await listNoteComments(w.env, w.noteId);
		expect(comment).toMatchObject({
			authorId: w.bo.user.id,
			attachmentId: 'map',
			x: 0.25,
			y: 0.75,
			replies: []
		});
	});

	it('refuses another note’s image, a file that isn’t an image, and a point off the image', async () => {
		const w = await world();
		expect(await status(w.pin(w.ada, 'tent')), 'an image in another note').toBe(400);
		expect(await status(w.pin(w.ada, 'route')), 'a PDF in this note').toBe(400);
		expect(await status(w.pin(w.ada, 'nothing')), 'no such file').toBe(400);
		expect(await status(w.pin(w.ada, 'map', 1.5, 0.5)), 'past the right edge').toBe(400);
		expect(await listNoteComments(w.env, w.noteId)).toEqual([]);
	});

	it('refuses a viewer, who can’t comment at all', async () => {
		const w = await world();
		expect(await status(w.pin(w.vic, 'map'))).toBe(403);
	});

	it('keeps replies to a pinned comment off the image', async () => {
		const w = await world();
		const id = await w.pin(w.bo, 'map');
		const note = await loadNote(w.env, w.ada, w.noteId);
		await createNoteComment(w.env, w.ada, note, body('Got it'), id);
		const [comment] = await listNoteComments(w.env, w.noteId);
		expect(comment.replies).toHaveLength(1);
		expect(comment.replies[0], 'the reply has no point').toMatchObject({
			attachmentId: null,
			x: null,
			y: null
		});
	});
});
