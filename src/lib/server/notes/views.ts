import { and, desc, eq, ne } from 'drizzle-orm';
import { db, schema } from '../db';
import { markRead } from '../notifications/inbox';
import { getObjectUrl } from '../storage';
import type { SignedIn } from '../auth/session';
import type { LoadedNote } from './access';

/**
 * Records that this member opened the note now, and marks read their unread inbox
 * notifications about it: mentions in it, its sharing, and comments on it, all of which the
 * notification handlers file under the item `note:<id>`.
 */
export async function recordNoteView(env: Env, who: SignedIn, note: LoadedNote, now = Date.now()) {
	const { noteViews } = schema;
	await Promise.all([
		db(env)
			.insert(noteViews)
			.values({ noteId: note.id, userId: who.user.id, viewedAt: now })
			.onConflictDoUpdate({
				target: [noteViews.noteId, noteViews.userId],
				set: { viewedAt: now }
			}),
		markRead(env, who.user.id, `note:${note.id}`, now)
	]);
}

// Campsite pages a note's viewers; the note page shows only the 50 who opened it last.
const viewersShown = 50;

/**
 * Who else has opened the note, latest first, and how many times it was opened signed out.
 * The reader is left out, as in Campsite, so recording their own view alongside doesn't race.
 */
export async function noteViewers(env: Env, who: SignedIn, note: LoadedNote) {
	const { noteViews, users } = schema;
	const rows = await db(env)
		.select({
			id: users.id,
			name: users.name,
			avatarKey: users.avatarKey,
			viewedAt: noteViews.viewedAt
		})
		.from(noteViews)
		.innerJoin(users, eq(users.id, noteViews.userId))
		.where(and(eq(noteViews.noteId, note.id), ne(noteViews.userId, who.user.id)))
		.orderBy(desc(noteViews.viewedAt))
		.limit(viewersShown);
	return {
		people: rows.map(({ avatarKey, ...person }) => ({
			...person,
			avatarUrl: avatarKey ? getObjectUrl(avatarKey) : null
		})),
		anonymous: note.anonymousViews
	};
}
