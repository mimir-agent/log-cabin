import { and, asc, eq, sql } from 'drizzle-orm';
import { db, schema } from './db';
import type { SignedIn } from './auth/session';
import { loadNote, visibleNoteIds } from './notes/access';
import {
	loadThread,
	readThreadNaming,
	threadNaming,
	threadPicturePath,
	unreadCount
} from './chat/threads';
import { publish } from './realtime/publish';

export type FavoriteSubject = { type: 'note' | 'thread'; id: string };

/** Favorites or unfavorites a note or thread this member can see; 404 for one they can't. */
export async function setFavorite(
	env: Env,
	who: SignedIn,
	subject: FavoriteSubject,
	favorite: boolean
) {
	if (subject.type === 'thread') await loadThread(env, who, subject.id);
	else await loadNote(env, who, subject.id);
	const { favorites: f } = schema;
	const row = { userId: who.user.id, subjectType: subject.type, subjectId: subject.id };
	if (favorite) {
		await db(env)
			.insert(f)
			.values({ ...row, createdAt: Date.now() })
			.onConflictDoNothing();
	} else {
		await db(env)
			.delete(f)
			.where(
				and(
					eq(f.userId, row.userId),
					eq(f.subjectType, row.subjectType),
					eq(f.subjectId, row.subjectId)
				)
			);
	}
	// The sidebar of each open tab reloads its favorites.
	await publish(env, `user:${who.user.id}`, { type: 'chat.threads' });
}

/** The ids of this member's favorite notes or threads. */
export async function favoriteIds(env: Env, who: SignedIn, type: 'note' | 'thread') {
	const { favorites: f } = schema;
	const rows = await db(env)
		.select({ id: f.subjectId })
		.from(f)
		.where(and(eq(f.userId, who.user.id), eq(f.subjectType, type)));
	return new Set(rows.map((row) => row.id));
}

/**
 * This member's favorite threads and notes for the sidebar, oldest favorite first. A thread
 * favorite always has its membership (0026's trigger drops it on leaving). A note they can no
 * longer see is left out, and hiddenNotes says there was one; dropUnseenNoteFavorites deletes it.
 */
export async function sidebarFavorites(env: Env, who: SignedIn) {
	const { favorites: f, chatThreads: t, chatThreadMembers: m, notes } = schema;
	const mine = (type: 'note' | 'thread') => and(eq(f.userId, who.user.id), eq(f.subjectType, type));
	const [threads, noteRows] = await Promise.all([
		db(env)
			.select({
				id: t.id,
				dmKey: t.dmKey,
				imageKey: t.imageKey,
				naming: threadNaming(t.id, who.user.id),
				unread: unreadCount(t.id, who.user.id, m.lastReadAt),
				markedUnread: m.markedUnread
			})
			.from(f)
			.innerJoin(t, eq(t.id, f.subjectId))
			.innerJoin(m, and(eq(m.threadId, t.id), eq(m.userId, who.user.id)))
			.where(mine('thread'))
			.orderBy(asc(f.createdAt)),
		db(env)
			.select({
				id: f.subjectId,
				title: notes.title,
				visible: sql<number>`${notes.id} IS NOT NULL AND ${visibleNoteIds(who)}`
			})
			.from(f)
			.leftJoin(notes, eq(notes.id, f.subjectId))
			.where(mine('note'))
			.orderBy(asc(f.createdAt))
	]);
	return {
		threads: threads.map(({ naming, dmKey, imageKey, unread, markedUnread, ...thread }) => ({
			...thread,
			...readThreadNaming(naming),
			group: dmKey === null,
			pictureUrl: imageKey ? threadPicturePath(thread.id, imageKey) : null,
			unread: unread > 0 || markedUnread
		})),
		notes: noteRows.filter((n) => n.visible).map(({ id, title }) => ({ id, title: title! })),
		hiddenNotes: noteRows.some((n) => !n.visible)
	};
}

/**
 * Deletes this member's favorites of notes they can no longer see. Access is lost in many
 * places, so the root layout calls this on each page rather than each of them.
 */
export async function dropUnseenNoteFavorites(env: Env, who: SignedIn) {
	const { favorites: f, notes } = schema;
	await db(env)
		.delete(f)
		.where(
			and(
				eq(f.userId, who.user.id),
				eq(f.subjectType, 'note'),
				sql`${f.subjectId} NOT IN (SELECT ${notes.id} FROM ${notes} WHERE ${visibleNoteIds(who)})`
			)
		);
}
