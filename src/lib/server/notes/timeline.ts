import { and, asc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { NoteRefType } from '../db/schema';
import { newId } from '../id';
import { publish } from '../realtime/publish';
import type { SignedIn } from '../auth/session';
import { visibleProjectIds } from '../posts/access';
import { docNoteRefs, type DocNode } from '../../editor/doc';
import { visibleNoteIds } from './access';

// A note's timeline: what happened to it besides edits and comments, shown among its comments.
// Each line names the person acting.

type NoteEvent =
	| { kind: 'project' | 'pinned' | 'unpinned'; projectId: string }
	| { kind: 'title'; title: string }
	| { kind: 'posted'; projectId: string; refType: 'post'; refId: string }
	| { kind: 'from_post'; refType: 'post'; refId: string };

/**
 * One line on the note's timeline. The caller publishes it with `publishNoteTimeline`, as it
 * may already.
 */
export async function recordNoteEvent(
	env: Env,
	noteId: string,
	actorId: string,
	event: NoteEvent,
	now = Date.now()
) {
	await db(env)
		.insert(schema.noteEvents)
		.values({ id: newId(now), noteId, actorId, ...event, createdAt: now });
}

/** Tells those with the note open that its timeline has a new line. */
export async function publishNoteTimeline(env: Env, noteId: string) {
	await publish(env, `note:${noteId}`, { type: 'note.timeline', noteId });
}

/**
 * Records that a post or note now links to each existing note its body links to, once per
 * pair: a later save that still links there records nothing new. A note's links to itself
 * record nothing. Returns the notes that gained a line; the caller publishes on each.
 */
export async function recordNoteReferences(
	env: Env,
	actorId: string,
	ref: { type: NoteRefType; id: string },
	body: DocNode,
	now = Date.now()
): Promise<string[]> {
	const { notes, noteEvents } = schema;
	const d = db(env);
	const gained: string[] = [];
	for (const noteId of docNoteRefs(body)) {
		if (ref.type === 'note' && noteId === ref.id) continue;
		// One note per statement, so a body with many links never binds more than D1 allows.
		const added = await d
			.insert(noteEvents)
			.select(
				d
					.select({
						id: sql<string>`${newId(now)}`.as('id'),
						noteId: notes.id,
						actorId: sql<string>`${actorId}`.as('actor_id'),
						kind: sql<'referenced'>`'referenced'`.as('kind'),
						projectId: sql<null>`NULL`.as('project_id'),
						title: sql<null>`NULL`.as('title'),
						refType: sql<NoteRefType>`${ref.type}`.as('ref_type'),
						refId: sql<string>`${ref.id}`.as('ref_id'),
						createdAt: sql<number>`${now}`.as('created_at')
					})
					.from(notes)
					.where(eq(notes.id, noteId))
			)
			.onConflictDoNothing()
			.returning({ noteId: noteEvents.noteId });
		if (added.length > 0) gained.push(noteId);
	}
	return gained;
}

/** A line of a note's timeline as its reader sees it. */
export type NoteTimelineEvent = { id: string; createdAt: number; actorName: string } & (
	| { kind: 'project' | 'pinned' | 'unpinned' | 'posted'; project: { id: string; name: string } }
	| { kind: 'title'; title: string }
	| { kind: 'referenced'; ref: { type: NoteRefType; id: string; title: string } }
	// The post this doc was copied from; null once it is deleted or out of the reader's sight.
	| { kind: 'from_post'; post: { id: string; title: string } | null }
);

/**
 * The note's timeline, oldest first, for someone who can see the note. A line about a project
 * they can't see, or a reference from a post or note they can't see, is left out whole, so
 * not even its existence reaches them.
 */
export async function listNoteEvents(
	env: Env,
	who: SignedIn,
	noteId: string
): Promise<NoteTimelineEvent[]> {
	const { noteEvents: e, users, projects, posts, notes } = schema;
	const rows = await db(env)
		.select({
			id: e.id,
			kind: e.kind,
			createdAt: e.createdAt,
			actorName: users.name,
			title: e.title,
			projectId: projects.id,
			projectName: projects.name,
			refType: e.refType,
			refId: e.refId,
			refTitle: sql<string | null>`coalesce(${posts.title}, ${notes.title})`
		})
		.from(e)
		.innerJoin(users, eq(users.id, e.actorId))
		.leftJoin(projects, and(eq(projects.id, e.projectId), visibleProjectIds(who)))
		.leftJoin(
			posts,
			and(
				eq(e.refType, 'post'),
				eq(posts.id, e.refId),
				sql`${posts.projectId} IN (SELECT ${projects.id} FROM ${projects} WHERE ${visibleProjectIds(who)})`
			)
		)
		.leftJoin(notes, and(eq(e.refType, 'note'), eq(notes.id, e.refId), visibleNoteIds(who)))
		.where(
			and(
				eq(e.noteId, noteId),
				or(
					eq(e.kind, 'title'),
					eq(e.kind, 'from_post'),
					and(inArray(e.kind, ['project', 'pinned', 'unpinned', 'posted']), isNotNull(projects.id)),
					and(
						eq(e.kind, 'referenced'),
						or(isNotNull(posts.id), isNotNull(notes.id)),
						// A post that shared the note has its own line, which says more.
						sql`NOT EXISTS (SELECT 1 FROM ${e} AS shared WHERE shared.note_id = ${e.noteId} AND shared.kind = 'posted' AND shared.ref_id = ${e.refId})`
					)
				)
			)
		)
		// Ids made in the same millisecond don't sort in order; rowid is the order they were stored.
		.orderBy(asc(e.createdAt), sql`${e}.rowid`);
	return rows.map((row): NoteTimelineEvent => {
		const line = { id: row.id, createdAt: row.createdAt, actorName: row.actorName };
		const missing = (what: string) =>
			new Error(`listNoteEvents: ${row.kind} event ${row.id} has no ${what}`);
		switch (row.kind) {
			case 'title':
				if (row.title === null) throw missing('title');
				return { ...line, kind: row.kind, title: row.title };
			case 'referenced':
				if (!row.refType || !row.refId || row.refTitle === null) throw missing('reference');
				return {
					...line,
					kind: row.kind,
					ref: { type: row.refType, id: row.refId, title: row.refTitle }
				};
			case 'from_post':
				return {
					...line,
					kind: row.kind,
					post: row.refTitle === null || !row.refId ? null : { id: row.refId, title: row.refTitle }
				};
			default:
				if (!row.projectId || row.projectName === null) throw missing('project');
				return {
					...line,
					kind: row.kind,
					project: { id: row.projectId, name: row.projectName }
				};
		}
	});
}
