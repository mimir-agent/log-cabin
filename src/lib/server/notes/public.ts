import { error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { randomToken } from '../auth/session';
import { getOrg } from '../org';
import { publish } from '../realtime/publish';
import { getObject } from '../storage';
import { attachmentKey } from '../posts/attachments';
import { publicFileResponse, withoutMentionIds, withoutResourceIds } from '../posts/public-links';
import { docAttachments, type DocNode } from '../../editor/doc';
import { notes as strings } from '../../strings/notes';
import { posts as postStrings } from '../../strings/posts';
import type { LoadedNote } from './access';

/**
 * Publishes the note to the web under a fresh unguessable token, or takes it down. Anyone who
 * may edit the note does either, while the org allows public links. Taking it down clears the
 * token, so the old URL stops working for good and publishing again makes a new one.
 */
export async function setNotePublic(env: Env, note: LoadedNote, on: boolean) {
	if (note.access !== 'edit') error(403, strings.errors.cannotPublish);
	if (on && !(await getOrg(env)).publicPosts) error(403, postStrings.errors.publicLinksOff);
	if (on === (note.publicToken !== null)) return;
	await db(env)
		.update(schema.notes)
		.set({ publicToken: on ? randomToken() : null })
		.where(eq(schema.notes.id, note.id));
	await publish(env, `note:${note.id}`, { type: 'note.sharing', noteId: note.id });
}

/**
 * What a signed-out reader of /p/notes/<token> gets: the note's title, stored body, author name
 * and last edit, and the org's name. Nothing about its project, comments, shares or viewers.
 * 404 when the token is unknown or taken down, or the org has turned public links off.
 */
export async function loadPublicNote(env: Env, token: string) {
	const { notes, users } = schema;
	const [org, row] = await Promise.all([
		getOrg(env),
		db(env)
			.select({
				id: notes.id,
				title: notes.title,
				body: notes.body,
				bodyText: notes.bodyText,
				updatedAt: notes.updatedAt,
				thumbnailVersion: notes.thumbnailVersion,
				authorName: users.name
			})
			.from(notes)
			.innerJoin(users, eq(users.id, notes.authorId))
			.where(eq(notes.publicToken, token))
			.get()
	]);
	if (!org.publicPosts || !row) error(404, postStrings.errors.publicLinkDead);
	return {
		...row,
		body: withoutCommentMarks(
			withoutResourceIds(withoutMentionIds(JSON.parse(row.body) as DocNode))
		),
		org: { name: org.name, indexable: org.publicPostsIndexable }
	};
}

/** The body without the passages comments were made on: a signed-out reader sees no comments. */
function withoutCommentMarks(node: DocNode): DocNode {
	const out = { ...node };
	if (node.marks) out.marks = node.marks.filter((mark) => mark.type !== 'noteComment');
	if (node.content) out.content = node.content.map(withoutCommentMarks);
	return out;
}

/**
 * A file shown in the body of the note published under this token, as its public page serves
 * it; 404 for a file the body doesn't show or that wasn't uploaded into this note.
 */
export async function publicNoteFile(env: Env, token: string, id: string) {
	const note = await loadPublicNote(env, token);
	const { noteAttachments } = schema;
	const own =
		docAttachments(note.body).includes(id) &&
		(await db(env)
			.select({ id: noteAttachments.id })
			.from(noteAttachments)
			.where(and(eq(noteAttachments.id, id), eq(noteAttachments.noteId, note.id)))
			.get());
	const object = own && (await getObject(env, attachmentKey(id)));
	if (!object) error(404, postStrings.errors.fileNotFound);
	return publicFileResponse(object);
}

/** Counts one signed-out visit to the note published under this token, while links work. */
export async function countAnonymousView(env: Env, token: string) {
	const { notes, org } = schema;
	await db(env)
		.update(notes)
		.set({ anonymousViews: sql`${notes.anonymousViews} + 1` })
		.where(and(eq(notes.publicToken, token), sql`(SELECT ${org.publicPosts} FROM ${org}) = 1`));
}

/** The text's first `max` characters, cut at a word with an ellipsis when it goes on. */
export function excerpt(text: string, max = 160) {
	const flat = text.replace(/\s+/g, ' ').trim();
	if (flat.length <= max) return flat;
	// A word that ends exactly at max is whole, so the space just after it counts.
	const space = flat.slice(0, max + 1).lastIndexOf(' ');
	// One word longer than max, such as a pasted link, is cut where it is.
	return `${flat.slice(0, space > 0 ? space : max)}…`;
}
