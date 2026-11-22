import { describe, expect, it } from 'vitest';
import { upsertDevMember } from '../dev-login';
import { suggestUsername } from '../people/usernames';
import { fakeD1 } from '../testing/fake-d1';
import { fakeBucket } from '../testing/fake-durable-object';
import { useTestEnv } from '../testing/env';
import type { SignedIn } from '../auth/session';
import { createNote, validateNoteInput } from './notes';
import { refreshThumbnail, thumbnailKey, type RenderThumbnails } from './thumbnails';

async function world() {
	const { DB, sqlite } = fakeD1();
	const { bucket, objects } = fakeBucket();
	const env = { DB, BUCKET: bucket, JOBS: { send: async () => {} } } as unknown as Env;
	useTestEnv(env);
	const id = await upsertDevMember(env, { email: 'ada@example.com', name: 'Ada', role: 'member' });
	const ada: SignedIn = {
		user: {
			id,
			name: 'Ada',
			username: suggestUsername('Ada'),
			email: '',
			avatarUrl: null,
			theme: 'system'
		},
		member: { id: `m-${id}`, role: 'member' }
	};
	const input = validateNoteInput({ title: 'Hike plan', body: '{"type":"doc","content":[]}' });
	if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
	const noteId = await createNote(env, ada, input.input);
	/** Draws a PNG-ish marker naming the title it was given, and counts the drawings. */
	const drawn: string[] = [];
	const render: RenderThumbnails = async (note) => {
		drawn.push(note.title);
		const bytes = new TextEncoder().encode(note.title);
		return { og: bytes, grid: bytes };
	};
	const setVersion = (version: number, title = 'Hike plan') =>
		sqlite
			.prepare('UPDATE notes SET version = ?, title = ? WHERE id = ?')
			.run(version, title, noteId);
	const thumbnailVersion = () =>
		(
			sqlite.prepare('SELECT thumbnail_version AS v FROM notes WHERE id = ?').get(noteId) as {
				v: number | null;
			}
		).v;
	const keys = () => [...objects.keys()].filter((key) => key.includes('/thumb-')).sort();
	return { env, sqlite, objects, noteId, drawn, render, setVersion, thumbnailVersion, keys };
}

describe('redrawing a note’s thumbnail', () => {
	it('draws both sizes once for a version, and skips that version after', async () => {
		const w = await world();
		await refreshThumbnail(w.env, w.noteId, w.render);
		await refreshThumbnail(w.env, w.noteId, w.render);
		expect(w.drawn, 'drawn once').toEqual(['Hike plan']);
		expect(w.thumbnailVersion()).toBe(1);
		expect(w.keys()).toEqual([
			`notes/${w.noteId}/thumb-1-grid.png`,
			`notes/${w.noteId}/thumb-1.png`
		]);
		expect(new TextDecoder().decode(w.objects.get(thumbnailKey(w.noteId, 1, 'og')))).toBe(
			'Hike plan'
		);
	});

	it('draws a new version and deletes the previous version’s pictures', async () => {
		const w = await world();
		await refreshThumbnail(w.env, w.noteId, w.render);
		w.setVersion(2, 'Hike plan B');
		await refreshThumbnail(w.env, w.noteId, w.render);
		expect(w.drawn).toEqual(['Hike plan', 'Hike plan B']);
		expect(w.thumbnailVersion()).toBe(2);
		expect(w.keys(), 'only version 2 left').toEqual([
			`notes/${w.noteId}/thumb-2-grid.png`,
			`notes/${w.noteId}/thumb-2.png`
		]);
	});

	it('draws nothing for a note deleted before the job ran', async () => {
		const w = await world();
		w.sqlite.prepare('DELETE FROM notes WHERE id = ?').run(w.noteId);
		await refreshThumbnail(w.env, w.noteId, w.render);
		expect(w.drawn).toEqual([]);
		expect(w.keys()).toEqual([]);
	});

	it('keeps nothing it drew for a note deleted while drawing', async () => {
		const w = await world();
		const render: RenderThumbnails = async (note) => {
			w.sqlite.prepare('DELETE FROM notes WHERE id = ?').run(w.noteId);
			return w.render(note);
		};
		await refreshThumbnail(w.env, w.noteId, render);
		expect(w.keys(), 'no pictures left for a note that is gone').toEqual([]);
	});

	it('keeps the newer pictures when an older version’s job finishes after them', async () => {
		const w = await world();
		const render: RenderThumbnails = async (note) => {
			// A later snapshot's job draws version 2 while this one draws version 1.
			w.setVersion(2);
			await refreshThumbnail(w.env, w.noteId, w.render);
			return w.render(note);
		};
		await refreshThumbnail(w.env, w.noteId, render);
		expect(w.thumbnailVersion()).toBe(2);
		expect(w.keys(), 'version 1’s pictures deleted').toEqual([
			`notes/${w.noteId}/thumb-2-grid.png`,
			`notes/${w.noteId}/thumb-2.png`
		]);
	});
});
