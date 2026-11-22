// Each note's thumbnails in R2, one pair per version of the note, redrawn by a job after its
// body is stored or it's renamed. This module imports only the renderer's types: pages import
// it, and only the queue consumer (src/worker.ts, bundled by wrangler) may load the renderer's
// WebAssembly, which Vite can't bundle.
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db, schema } from '../db';
import { deleteObject, getObject, putObject } from '../storage';
import type { Handlers } from '../notifications/handlers';
import type { NoteThumbnails, ThumbnailNote } from './thumbnail';
import { core } from '../../strings/core';

/** og is the public page's link preview; grid is a card in the notes index. */
export const thumbnailSizes = {
	og: { width: 1200, height: 630 },
	grid: { width: 600, height: 450 }
};
export type ThumbnailSize = keyof typeof thumbnailSizes;

const sizes: ThumbnailSize[] = ['og', 'grid'];

export function thumbnailKey(noteId: string, version: number, size: ThumbnailSize): string {
	return `notes/${noteId}/thumb-${version}${size === 'grid' ? '-grid' : ''}.png`;
}

/**
 * The note's thumbnail at `size` with `cacheControl`, for a caller that has checked who may see
 * the note; 404 before its first one is drawn.
 */
export async function thumbnailResponse(
	env: Env,
	note: { id: string; thumbnailVersion: number | null },
	size: ThumbnailSize,
	cacheControl: string
): Promise<Response> {
	const object =
		note.thumbnailVersion !== null &&
		(await getObject(env, thumbnailKey(note.id, note.thumbnailVersion, size)));
	if (!object) error(404, core.errors.notFound);
	return new Response(object.body, {
		headers: {
			'content-type': 'image/png',
			'cache-control': cacheControl,
			'x-content-type-options': 'nosniff'
		}
	});
}

async function deleteThumbnails(env: Env, noteId: string, version: number) {
	for (const size of sizes) await deleteObject(env, thumbnailKey(noteId, version, size));
}

export type RenderThumbnails = (note: ThumbnailNote) => Promise<NoteThumbnails>;

/**
 * Draws the note's thumbnails for the version it's at, unless they're drawn already, and
 * deletes the previous version's. A note deleted before this runs gets none.
 */
export async function refreshThumbnail(env: Env, noteId: string, render: RenderThumbnails) {
	const { notes } = schema;
	const note = await db(env)
		.select({
			title: notes.title,
			body: notes.body,
			version: notes.version,
			thumbnailVersion: notes.thumbnailVersion
		})
		.from(notes)
		.where(eq(notes.id, noteId))
		.get();
	if (!note || note.thumbnailVersion === note.version) return;
	const pictures = await render({ title: note.title, body: JSON.parse(note.body) });
	for (const size of sizes) {
		await putObject(env, thumbnailKey(noteId, note.version, size), pictures[size], 'image/png');
	}
	const stored = await db(env)
		.update(notes)
		.set({ thumbnailVersion: note.version })
		.where(
			and(
				eq(notes.id, noteId),
				or(isNull(notes.thumbnailVersion), lt(notes.thumbnailVersion, note.version))
			)
		)
		.returning({ id: notes.id });
	// Deleted while these were drawn, or a later version's job got there first: they're nobody's.
	if (stored.length === 0) return deleteThumbnails(env, noteId, note.version);
	if (note.thumbnailVersion !== null) await deleteThumbnails(env, noteId, note.thumbnailVersion);
}

/** The queue consumer's handler, drawing with `render`. */
export function thumbnailHandlers(render: RenderThumbnails): Handlers {
	return { 'note.thumbnail': (env, job) => refreshThumbnail(env, job.noteId, render) };
}
