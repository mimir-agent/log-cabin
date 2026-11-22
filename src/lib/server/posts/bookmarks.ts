import { error } from '@sveltejs/kit';
import { and, asc, eq, gt, lt, max, desc } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '../id';
import { publish } from '../realtime/publish';
import type { SignedIn } from '../auth/session';
import { posts as strings } from '../../strings/posts';
import { loadWritableProject } from './access';

export type BookmarkInput = { title: string; url: string };

/** A bookmark from a form: a title of up to 255 characters and an http(s) URL. */
export function parseBookmark(form: FormData): { input: BookmarkInput } | { message: string } {
	const title = String(form.get('title') ?? '').trim();
	const raw = String(form.get('url') ?? '').trim();
	if (!title) return { message: strings.errors.bookmarkTitleMissing };
	if (title.length > 255) return { message: strings.errors.bookmarkTitleTooLong };
	const url = URL.canParse(raw) ? new URL(raw) : null;
	if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
		return { message: strings.errors.bookmarkUrlInvalid };
	}
	return { input: { title, url: url.href } };
}

export async function addBookmark(
	env: Env,
	who: SignedIn,
	projectId: string,
	input: BookmarkInput
) {
	await loadWritableProject(env, who, projectId);
	const { projectBookmarks: b } = schema;
	const last = await db(env)
		.select({ position: max(b.position) })
		.from(b)
		.where(eq(b.projectId, projectId))
		.get();
	await db(env)
		.insert(b)
		.values({
			id: newId(),
			projectId,
			...input,
			position: (last?.position ?? -1) + 1,
			createdBy: who.user.id,
			createdAt: Date.now()
		});
	await publish(env, `project:${projectId}`, { type: 'bookmarks.changed' });
}

async function loadBookmark(env: Env, projectId: string, id: string) {
	const { projectBookmarks: b } = schema;
	const row = await db(env)
		.select()
		.from(b)
		.where(and(eq(b.id, id), eq(b.projectId, projectId)))
		.get();
	if (!row) error(404, strings.errors.bookmarkNotFound);
	return row;
}

/** Changes a bookmark's title and link where it stands; its place in the list stays. */
export async function updateBookmark(
	env: Env,
	who: SignedIn,
	projectId: string,
	id: string,
	input: BookmarkInput
) {
	await loadWritableProject(env, who, projectId);
	await loadBookmark(env, projectId, id);
	await db(env)
		.update(schema.projectBookmarks)
		.set(input)
		.where(eq(schema.projectBookmarks.id, id));
	await publish(env, `project:${projectId}`, { type: 'bookmarks.changed' });
}

export async function removeBookmark(env: Env, who: SignedIn, projectId: string, id: string) {
	await loadWritableProject(env, who, projectId);
	await loadBookmark(env, projectId, id);
	await db(env).delete(schema.projectBookmarks).where(eq(schema.projectBookmarks.id, id));
	await publish(env, `project:${projectId}`, { type: 'bookmarks.changed' });
}

/** Swaps a bookmark with its neighbour above or below; at either end it stays put. */
export async function moveBookmark(
	env: Env,
	who: SignedIn,
	projectId: string,
	id: string,
	direction: 'up' | 'down'
) {
	await loadWritableProject(env, who, projectId);
	const bookmark = await loadBookmark(env, projectId, id);
	const { projectBookmarks: b } = schema;
	const neighbour = await db(env)
		.select({ id: b.id, position: b.position })
		.from(b)
		.where(
			and(
				eq(b.projectId, projectId),
				direction === 'up' ? lt(b.position, bookmark.position) : gt(b.position, bookmark.position)
			)
		)
		.orderBy(direction === 'up' ? desc(b.position) : asc(b.position))
		.get();
	if (!neighbour) return;
	await db(env).batch([
		db(env).update(b).set({ position: neighbour.position }).where(eq(b.id, bookmark.id)),
		db(env).update(b).set({ position: bookmark.position }).where(eq(b.id, neighbour.id))
	]);
	await publish(env, `project:${projectId}`, { type: 'bookmarks.changed' });
}

export async function projectBookmarks(env: Env, projectId: string) {
	const { projectBookmarks: b } = schema;
	return db(env)
		.select({ id: b.id, title: b.title, url: b.url })
		.from(b)
		.where(eq(b.projectId, projectId))
		.orderBy(asc(b.position));
}
