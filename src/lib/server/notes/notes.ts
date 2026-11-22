import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { ftsQuery } from '../search/search';
import { db, schema } from '../db';
import type { NoteLayout, NotePermission } from '../db/schema';
import { newId } from '../id';
import { emit } from '../events';
import { closeLiveNote, deleteLiveNote, publish } from '../realtime/publish';
import { deleteWithNotifications } from '../notifications/notify';
import type { SignedIn } from '../auth/session';
import { DocError, docMentions, docText, sanitizeDoc, type DocNode } from '../../editor/doc';
import { publishNoteTimeline, recordNoteEvent, recordNoteReferences } from './timeline';
import { notes as strings } from '../../strings/notes';
import { posts as postStrings } from '../../strings/posts';
import { loadProject, loadWritableProject, visibleProjectIds } from '../posts/access';
import { orgPeople, projectPeople } from '../posts/projects';
import { noteAccess, noteFacts, visibleNoteIds, type LoadedNote } from './access';

export type NoteInput = { title: string; body: string; bodyText: string; mentions: string[] };

/** A note's title may be empty, and so may its body: a new note starts blank. */
export function validateNoteInput(
	form: Record<string, FormDataEntryValue>
): { ok: true; input: NoteInput } | { ok: false; message: string } {
	const title = String(form.title ?? '').trim();
	if (title.length > 200) return { ok: false, message: strings.errors.titleTooLong };
	try {
		const doc = sanitizeDoc(String(form.body ?? ''));
		return {
			ok: true,
			input: {
				title,
				body: JSON.stringify(doc),
				bodyText: docText(doc),
				mentions: docMentions(doc)
			}
		};
	} catch (e) {
		if (e instanceof DocError)
			return { ok: false, message: postStrings.errors.bodyInvalid(e.message) };
		throw e;
	}
}

/** Emits a mention for each person named who can see the note, other than the writer. */
export async function emitNoteMentions(
	env: Env,
	noteId: string,
	mentioned: string[],
	authorId: string
) {
	const ids = mentioned.filter((id) => id !== authorId);
	if (ids.length === 0) return;
	const note = await db(env).select().from(schema.notes).where(eq(schema.notes.id, noteId)).get();
	if (!note) throw new Error(`emitNoteMentions: note ${noteId} doesn't exist`);
	const { members } = schema;
	const people = await db(env)
		.select({ userId: members.userId, role: members.role })
		.from(members)
		.where(and(inArray(members.userId, ids), isNull(members.deactivatedAt)));
	for (const person of people) {
		if (noteAccess(await noteFacts(env, note, person)) === 'none') continue;
		await emit(env, {
			kind: 'mention',
			subjectType: 'note',
			subjectId: noteId,
			mentionedUserId: person.userId,
			authorId
		});
	}
}

/** Who the editor offers to mention. A guest is offered only the people of the note's project. */
export async function noteMentionCandidates(env: Env, who: SignedIn, projectId: string | null) {
	if (who.member.role !== 'guest') return orgPeople(env);
	return projectId ? projectPeople(env, projectId) : [];
}

/**
 * A new note, private to its author, or shared with a project they may write in so that
 * everyone there can view it at once.
 */
export async function createNote(
	env: Env,
	who: SignedIn,
	input: NoteInput,
	projectId: string | null = null,
	now = Date.now()
) {
	if (who.member.role === 'viewer') error(403, strings.errors.cannotCreate);
	if (projectId) await loadWritableProject(env, who, projectId);
	const id = newId(now);
	const { mentions, ...fields } = input;
	await db(env)
		.insert(schema.notes)
		.values({
			id,
			authorId: who.user.id,
			...fields,
			...(projectId ? { projectId, projectPermission: 'view' as const } : {}),
			createdAt: now,
			updatedAt: now,
			updatedBy: who.user.id
		});
	await subscribeToNote(env, id, who.user.id, now);
	await emitNoteMentions(env, id, mentions, who.user.id);
	return id;
}

/** Subscribes someone to a note's new comments; the author and every commenter are. */
export async function subscribeToNote(env: Env, noteId: string, userId: string, now = Date.now()) {
	await db(env)
		.insert(schema.noteSubscriptions)
		.values({ noteId, userId, createdAt: now })
		.onConflictDoNothing();
}

/**
 * Renames the note. Titles aren't edited live, so the last rename wins. A new title is a new
 * version of the note, which its thumbnail shows.
 */
export async function renameNote(env: Env, who: SignedIn, note: LoadedNote, title: string) {
	if (note.access !== 'edit') error(403, strings.errors.cannotEdit);
	if (title.length > 200) error(400, strings.errors.titleTooLong);
	const { notes } = schema;
	const now = Date.now();
	await db(env)
		.update(notes)
		.set({ title, version: sql`${notes.version} + 1`, updatedAt: now, updatedBy: who.user.id })
		.where(eq(notes.id, note.id));
	if (title !== note.title) {
		await recordNoteEvent(env, note.id, who.user.id, { kind: 'title', title }, now);
	}
	await emit(env, { kind: 'note.thumbnail', noteId: note.id });
	await publish(env, `note:${note.id}`, { type: 'note.renamed', noteId: note.id });
}

/** The stored body, which seeds the live document of a note written before live editing. */
export async function storedBody(env: Env, noteId: string): Promise<DocNode> {
	const note = await db(env)
		.select({ body: schema.notes.body })
		.from(schema.notes)
		.where(eq(schema.notes.id, noteId))
		.get();
	if (!note) throw new Error(`storedBody: note ${noteId} doesn't exist`);
	return JSON.parse(note.body);
}

/**
 * Stores the body derived from the live document, so search, summaries and lists read
 * what people wrote, has its thumbnail redrawn, and tells anyone newly mentioned.
 * `editorId` made the latest change.
 */
export async function saveLiveBody(env: Env, noteId: string, body: DocNode, editorId: string) {
	let doc: DocNode;
	try {
		doc = sanitizeDoc(JSON.stringify(body));
	} catch (e) {
		// Someone with edit access sent a node or mark no page can render. The live document
		// (and its R2 snapshot) keeps it; the stored body stays at the last one pages can show.
		if (!(e instanceof DocError)) throw e;
		console.error(`saveLiveBody: note ${noteId} not stored: ${e.message}`);
		return;
	}
	const { notes } = schema;
	const before = await db(env)
		.select({ body: notes.body })
		.from(notes)
		.where(eq(notes.id, noteId))
		.get();
	// Deleted while its live document still had changes to store.
	if (!before) return;
	await db(env)
		.update(notes)
		.set({
			body: JSON.stringify(doc),
			bodyText: docText(doc),
			version: sql`${notes.version} + 1`,
			updatedAt: Date.now(),
			updatedBy: editorId
		})
		.where(eq(notes.id, noteId));
	await emit(env, { kind: 'note.thumbnail', noteId });
	const old = new Set(docMentions(JSON.parse(before.body)));
	const added = docMentions(doc).filter((id) => !old.has(id));
	await emitNoteMentions(env, noteId, added, editorId);
	const referenced = await recordNoteReferences(env, editorId, { type: 'note', id: noteId }, doc);
	for (const id of referenced) await publishNoteTimeline(env, id);
}

/** The note's author deletes it, and so does an admin who can open it. */
export function canDeleteNote(who: SignedIn, note: LoadedNote): boolean {
	return note.authorId === who.user.id || who.member.role === 'admin';
}

export async function deleteNote(env: Env, who: SignedIn, note: LoadedNote) {
	if (!canDeleteNote(who, note)) error(403, strings.errors.cannotDelete);
	await deleteWithNotifications(
		env,
		{ note: note.id },
		db(env).delete(schema.notes).where(eq(schema.notes.id, note.id))
	);
	await publish(env, `note:${note.id}`, { type: 'note.deleted', noteId: note.id });
	await deleteLiveNote(env, note.id);
}

/**
 * The project a note is shared with, for its breadcrumb: null when it isn't shared with one,
 * or when this member can't see that project.
 */
export async function noteProject(
	env: Env,
	who: SignedIn,
	note: { projectId: string | null; projectPermission: string }
) {
	if (!note.projectId || note.projectPermission === 'none') return null;
	const { projects } = schema;
	const project = await db(env)
		.select({ id: projects.id, name: projects.name, private: projects.private })
		.from(projects)
		.where(and(eq(projects.id, note.projectId), visibleProjectIds(who)))
		.get();
	return project ?? null;
}

/** All the notes someone can see, the ones they wrote, or the ones in projects they're in. */
export const noteFilters = ['all', 'created', 'forMe'] as const;
export type NoteFilter = (typeof noteFilters)[number];
/** Latest edit or comment first, or newest note first. */
export const noteSorts = ['activity', 'created'] as const;
export type NoteSort = (typeof noteSorts)[number];

export type NoteQuery = {
	filter: NoteFilter;
	sort: NoteSort;
	/** Words the title or text must hold; empty for every note. */
	q: string;
	/** Where the page starts, from the page before; null for the first. */
	cursor: string | null;
	/** Only the notes shared with this project. */
	projectId: string | null;
};

export const notesPageSize = 50;

/** Reads ?filter, ?sort, ?q, ?cursor and ?project; unknown values mean all notes by activity. */
export function noteQuery(params: URLSearchParams): NoteQuery {
	return {
		filter: noteFilters.find((f) => f === params.get('filter')) ?? 'all',
		sort: noteSorts.find((s) => s === params.get('sort')) ?? 'activity',
		q: (params.get('q') ?? '').trim(),
		cursor: params.get('cursor') || null,
		projectId: params.get('project') || null
	};
}

/**
 * A page of the notes this member can see, in the query's order, and the cursor of the page
 * after it (null on the last). The cursor is the last note's sort value and id.
 */
export async function listNotes(env: Env, who: SignedIn, query: NoteQuery) {
	const { notes, users, projects, projectMembers } = schema;
	const sorted = query.sort === 'created' ? notes.createdAt : notes.lastActivityAt;
	const which = {
		all: undefined,
		created: eq(notes.authorId, who.user.id),
		forMe: and(
			ne(notes.projectPermission, 'none'),
			sql`${notes.projectId} IN (SELECT ${projectMembers.projectId} FROM ${projectMembers} WHERE ${projectMembers.userId} = ${who.user.id})`
		)
	}[query.filter];
	const inProject =
		query.projectId === null
			? undefined
			: and(eq(notes.projectId, query.projectId), ne(notes.projectPermission, 'none'));
	const rows = await db(env)
		.select({
			id: notes.id,
			title: notes.title,
			// The first lines, for a card in the grid: the whole text would be sent for nothing.
			excerpt: sql<string>`substr(${notes.bodyText}, 1, 280)`,
			thumbnailVersion: notes.thumbnailVersion,
			createdAt: notes.createdAt,
			updatedAt: notes.updatedAt,
			lastActivityAt: notes.lastActivityAt,
			authorId: notes.authorId,
			authorName: users.name,
			projectPermission: notes.projectPermission,
			// The project it's shared with, for the row's tag: null when it isn't, or when this
			// member can't see that project, so a private project's name never reaches them.
			projectId: projects.id,
			projectName: projects.name,
			projectPrivate: projects.private,
			favorite: sql<number>`EXISTS (SELECT 1 FROM favorites f WHERE f.user_id = ${who.user.id}
				AND f.subject_type = 'note' AND f.subject_id = ${notes.id})`
		})
		.from(notes)
		.innerJoin(users, eq(users.id, notes.authorId))
		.leftJoin(
			projects,
			and(
				eq(projects.id, notes.projectId),
				ne(notes.projectPermission, 'none'),
				visibleProjectIds(who)
			)
		)
		.where(
			and(
				visibleNoteIds(who),
				which,
				inProject,
				query.q ? matching(query.q) : undefined,
				query.cursor ? after(sorted, query.cursor) : undefined
			)
		)
		.orderBy(desc(sorted), desc(notes.id))
		.limit(notesPageSize + 1);
	const page = rows.slice(0, notesPageSize);
	const last = page.at(-1);
	const next =
		rows.length > notesPageSize && last
			? `${query.sort === 'created' ? last.createdAt : last.lastActivityAt}.${last.id}`
			: null;
	return { notes: page.map((note) => ({ ...note, favorite: note.favorite === 1 })), next };
}

/** How this person lays out the notes index. */
export async function noteLayout(env: Env, who: SignedIn): Promise<NoteLayout> {
	const { users } = schema;
	const row = await db(env)
		.select({ noteLayout: users.noteLayout })
		.from(users)
		.where(eq(users.id, who.user.id))
		.get();
	if (!row) throw new Error(`noteLayout: user ${who.user.id} doesn't exist`);
	return row.noteLayout;
}

export async function setNoteLayout(env: Env, who: SignedIn, layout: NoteLayout) {
	const { users } = schema;
	await db(env).update(users).set({ noteLayout: layout }).where(eq(users.id, who.user.id));
}

/** Notes whose title or text hold every word typed, through the search index. */
function matching(q: string): SQL {
	const match = ftsQuery(q);
	// Nothing searchable typed (only punctuation): nothing matches, as on the search page.
	if (!match) return sql`0`;
	return sql`${schema.notes.id} IN (SELECT ref_id FROM search_index WHERE search_index MATCH ${match} AND kind = 'note')`;
}

/** The notes after a cursor "<sort value>.<id>", in the descending order listNotes uses. */
function after(sorted: SQLiteColumn, cursor: string): SQL {
	const [at, id] = cursor.split(/\.(.*)/s);
	const value = Number(at);
	if (!Number.isInteger(value) || !id) error(400, strings.errors.cursorInvalid(cursor));
	return or(lt(sorted, value), and(eq(sorted, value), lt(schema.notes.id, id))) as SQL;
}

/** The people a note is shared with by name, for its author's sharing panel. */
export async function listShares(env: Env, noteId: string) {
	const { noteShares, users } = schema;
	return db(env)
		.select({ userId: noteShares.userId, name: users.name, permission: noteShares.permission })
		.from(noteShares)
		.innerJoin(users, eq(users.id, noteShares.userId))
		.where(eq(noteShares.noteId, noteId))
		.orderBy(asc(users.name));
}

/** Anyone who may edit a note manages its sharing. */
function requireEditor(note: LoadedNote) {
	if (note.access !== 'edit') error(403, strings.errors.cannotManageSharing);
}

// Each statement in shareWithPeople binds every id, and D1 binds at most 100 parameters per
// statement, so one share names at most 50 people.
export const maxSharePeople = 50;

/**
 * Shares the note with active members, or changes what they may do. Only the people new to
 * the note hear about it. Guests share only through their projects, so a guest's note can't
 * reveal who else is in the organization.
 */
export async function shareWithPeople(
	env: Env,
	who: SignedIn,
	note: LoadedNote,
	userIds: string[],
	permission: NotePermission
) {
	requireEditor(note);
	if (who.member.role === 'guest') error(403, strings.errors.guestCannotSharePeople);
	const ids = [...new Set(userIds)];
	if (ids.length === 0) error(400, strings.errors.choosePeople);
	if (ids.length > maxSharePeople) error(400, strings.errors.tooManyPeople(maxSharePeople));
	if (ids.includes(who.user.id)) error(400, strings.errors.shareWithSelf);
	const { members, noteShares } = schema;
	const d = db(env);
	const [active, existing] = await Promise.all([
		d
			.select({ userId: members.userId })
			.from(members)
			.where(and(inArray(members.userId, ids), isNull(members.deactivatedAt))),
		d
			.select({ userId: noteShares.userId })
			.from(noteShares)
			.where(and(eq(noteShares.noteId, note.id), inArray(noteShares.userId, ids)))
	]);
	if (active.length !== ids.length) error(400, strings.errors.personNotFound);
	// One statement for everyone: a row per person would bind four parameters each.
	await d
		.insert(noteShares)
		.select(
			d
				.select({
					noteId: sql<string>`${note.id}`.as('note_id'),
					userId: members.userId,
					permission: sql<NotePermission>`${permission}`.as('permission'),
					createdAt: sql<number>`${Date.now()}`.as('created_at')
				})
				.from(members)
				.where(inArray(members.userId, ids))
		)
		.onConflictDoUpdate({
			target: [noteShares.noteId, noteShares.userId],
			set: { permission: sql`excluded.permission` }
		});
	const had = new Set(existing.map((s) => s.userId));
	const added = ids.filter((id) => !had.has(id));
	if (added.length > 0) {
		await emit(env, {
			kind: 'note.shared',
			noteId: note.id,
			sharedWith: added,
			authorId: who.user.id
		});
	}
	await publish(env, `note:${note.id}`, { type: 'note.sharing', noteId: note.id });
	await closeLiveNote(env, note.id);
}

export async function unshareWithPerson(env: Env, who: SignedIn, note: LoadedNote, userId: string) {
	requireEditor(note);
	const { noteShares } = schema;
	await db(env)
		.delete(noteShares)
		.where(and(eq(noteShares.noteId, note.id), eq(noteShares.userId, userId)));
	await publish(env, `note:${note.id}`, { type: 'note.sharing', noteId: note.id });
	await closeLiveNote(env, note.id);
}

/** Shares the note with one project the editor can see, or with none when projectId is null. */
export async function setProjectShare(
	env: Env,
	who: SignedIn,
	note: LoadedNote,
	share: { projectId: string; permission: NotePermission } | null
) {
	requireEditor(note);
	if (share) await loadProject(env, who, share.projectId);
	await db(env)
		.update(schema.notes)
		.set(
			share
				? { projectId: share.projectId, projectPermission: share.permission }
				: { projectId: null, projectPermission: 'none' }
		)
		.where(eq(schema.notes.id, note.id));
	if (share && share.projectId !== note.projectId) {
		const event = { kind: 'project', projectId: share.projectId } as const;
		await recordNoteEvent(env, note.id, who.user.id, event);
	}
	await publish(env, `note:${note.id}`, { type: 'note.sharing', noteId: note.id });
	await closeLiveNote(env, note.id);
}
