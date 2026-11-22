import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db, schema } from '../db';
import type { NoteReactionSubject } from '../db/schema';
import { newId } from '../id';
import { emit } from '../events';
import { deleteWithNotifications, retractReaction } from '../notifications/notify';
import { markLiveComment, publish, unmarkLiveComment } from '../realtime/publish';
import type { SignedIn } from '../auth/session';
import type { BodyInput } from '../posts/posts';
import type { CanvasPin } from '../posts/comments';
import { tickedBody } from '../posts/tasks';
import { assertReaction, summarizeReactions, type ReactionSummary } from '../posts/reactions';
import { notes as strings } from '../../strings/notes';
import { posts as postStrings } from '../../strings/posts';
import { core } from '../../strings/core';
import { docMentions } from '../../editor/doc';
import { canDiscussNote, type LoadedNote } from './access';
import { emitNoteMentions, subscribeToNote } from './notes';

// Comments and reactions on notes, shaped like those on posts so the same components show them.
// They emit note.commented rather than comment.created, whose consumers read the posts'
// comments table; a mention in a note comment is a mention of the note.

function requireDiscuss(who: SignedIn) {
	if (!canDiscussNote(who)) error(403, strings.errors.cannotComment);
}

/** A note's comments, oldest first, each top-level comment followed by its replies. */
export async function listNoteComments(env: Env, noteId: string) {
	const { noteComments, users } = schema;
	const resolver = alias(users, 'resolver');
	const rows = await db(env)
		.select({
			id: noteComments.id,
			parentId: noteComments.parentId,
			authorId: noteComments.authorId,
			authorName: users.name,
			body: noteComments.body,
			createdAt: noteComments.createdAt,
			editedAt: noteComments.editedAt,
			resolvedAt: noteComments.resolvedAt,
			resolvedByName: resolver.name,
			attachmentId: noteComments.attachmentId,
			x: noteComments.x,
			y: noteComments.y
		})
		.from(noteComments)
		.innerJoin(users, eq(users.id, noteComments.authorId))
		.leftJoin(resolver, eq(resolver.id, noteComments.resolvedBy))
		.where(eq(noteComments.noteId, noteId))
		.orderBy(asc(noteComments.createdAt), asc(noteComments.id));
	return rows
		.filter((c) => c.parentId === null)
		.map((c) => ({ ...c, replies: rows.filter((r) => r.parentId === c.id) }));
}

async function loadNoteComment(env: Env, note: LoadedNote, commentId: string) {
	const { noteComments } = schema;
	const comment = await db(env)
		.select()
		.from(noteComments)
		.where(and(eq(noteComments.id, commentId), eq(noteComments.noteId, note.id)))
		.get();
	if (!comment) error(404, postStrings.errors.commentNotFound);
	return comment;
}

/** Replies attach to the top-level comment, so a reply to a reply joins the same thread. */
export async function createNoteComment(
	env: Env,
	who: SignedIn,
	note: LoadedNote,
	input: BodyInput | (BodyInput & CanvasPin),
	replyTo: string | null,
	now = Date.now(),
	id = newId(now)
) {
	requireDiscuss(who);
	// The same comment again, after the answer to the first one was lost: it's stored already.
	const prior = await db(env)
		.select({ authorId: schema.noteComments.authorId, noteId: schema.noteComments.noteId })
		.from(schema.noteComments)
		.where(eq(schema.noteComments.id, id))
		.get();
	if (prior) {
		if (prior.authorId !== who.user.id || prior.noteId !== note.id) {
			error(409, core.errors.idRefused);
		}
		return id;
	}
	const parent = replyTo ? await loadNoteComment(env, note, replyTo) : null;
	const { mentions, ...fields } = input;
	await db(env)
		.insert(schema.noteComments)
		.values({
			id,
			noteId: note.id,
			parentId: parent ? (parent.parentId ?? parent.id) : null,
			authorId: who.user.id,
			...fields,
			createdAt: now
		});
	await subscribeToNote(env, note.id, who.user.id, now);
	await emitNoteMentions(env, note.id, mentions, who.user.id);
	await emit(env, {
		kind: 'note.commented',
		commentId: id,
		noteId: note.id,
		authorId: who.user.id
	});
	await publish(env, `note:${note.id}`, {
		type: 'comment.created',
		noteId: note.id,
		commentId: id
	});
	return id;
}

/**
 * A comment made on a passage of the note: its ends as the browser encoded them from its copy
 * of the live document (CommentPassage's start and end).
 */
export type CommentAnchor = { start: string; end: string };

/**
 * Marks the passage a new comment was made on in the note's live document. Anyone who may
 * comment may, though their socket is read-only: the hub writes the mark. The comment already
 * exists, so a passage that is gone, or a hub that fails, leaves it unanchored and is logged.
 */
export async function anchorNoteComment(
	env: Env,
	who: SignedIn,
	note: LoadedNote,
	commentId: string,
	anchor: CommentAnchor
) {
	const passage = { noteId: note.id, commentId, userId: who.user.id, ...anchor };
	try {
		if (!(await markLiveComment(env, passage))) {
			console.warn(
				`anchorNoteComment: comment ${commentId} on note ${note.id} stays unanchored, its passage is gone`
			);
		}
	} catch (failure) {
		console.error(
			`anchorNoteComment: expected to mark comment ${commentId}'s passage in note ${note.id}`,
			failure
		);
	}
}

/**
 * A comment on a point of one of the note's images. Whoever may comment on the note may pin
 * one, and whoever can see the note sees it, as with any comment; replies are plain replies.
 */
export async function pinNoteComment(
	env: Env,
	who: SignedIn,
	note: LoadedNote,
	pin: CanvasPin,
	input: BodyInput
) {
	requireDiscuss(who);
	const inRange = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;
	if (!inRange(pin.x) || !inRange(pin.y)) error(400, postStrings.errors.pinOutside);
	const { noteAttachments } = schema;
	const file = await db(env)
		.select({ contentType: noteAttachments.contentType })
		.from(noteAttachments)
		.where(and(eq(noteAttachments.id, pin.attachmentId), eq(noteAttachments.noteId, note.id)))
		.get();
	if (!file?.contentType.startsWith('image/')) error(400, strings.errors.pinNotAnImage);
	return createNoteComment(env, who, note, { ...input, ...pin }, null);
}

export async function updateNoteComment(
	env: Env,
	who: SignedIn,
	note: LoadedNote,
	commentId: string,
	input: BodyInput
) {
	const comment = await loadNoteComment(env, note, commentId);
	if (comment.authorId !== who.user.id) error(403, postStrings.errors.notYourComment);
	requireDiscuss(who);
	const { mentions, ...fields } = input;
	await db(env)
		.update(schema.noteComments)
		.set({ ...fields, editedAt: Date.now() })
		.where(eq(schema.noteComments.id, commentId));
	const before = new Set(docMentions(JSON.parse(comment.body)));
	const added = mentions.filter((id) => !before.has(id));
	await emitNoteMentions(env, note.id, added, who.user.id);
	await publish(env, `note:${note.id}`, { type: 'comment.updated', noteId: note.id, commentId });
}

/** Ticks or clears a task in one of the note's comments: anyone who may comment on the note may. */
export async function tickNoteComment(
	env: Env,
	who: SignedIn,
	note: LoadedNote,
	commentId: string,
	index: number,
	checked: boolean
) {
	requireDiscuss(who);
	const comment = await loadNoteComment(env, note, commentId);
	await db(env)
		.update(schema.noteComments)
		.set({ body: tickedBody(comment.body, index, checked) })
		.where(eq(schema.noteComments.id, commentId));
	await publish(env, `note:${note.id}`, { type: 'comment.updated', noteId: note.id, commentId });
}

/**
 * Authors delete their own comments, admins and the note's author any; replies go too. A
 * thread's mark comes off the words it was made on, so no highlight is left that opens
 * nothing; a hub that fails leaves it there, and is logged, but the comment is gone.
 */
export async function deleteNoteComment(
	env: Env,
	who: SignedIn,
	note: LoadedNote,
	commentId: string
) {
	const comment = await loadNoteComment(env, note, commentId);
	const mayDelete =
		comment.authorId === who.user.id ||
		note.authorId === who.user.id ||
		who.member.role === 'admin';
	if (!mayDelete) error(403, postStrings.errors.notYourComment);
	await deleteWithNotifications(
		env,
		{ noteComment: commentId },
		db(env).delete(schema.noteComments).where(eq(schema.noteComments.id, commentId))
	);
	await publish(env, `note:${note.id}`, { type: 'comment.deleted', noteId: note.id, commentId });
	if (comment.parentId !== null) return;
	try {
		await unmarkLiveComment(env, { noteId: note.id, commentId, userId: who.user.id });
	} catch (failure) {
		console.error(
			`deleteNoteComment: expected to take comment ${commentId}'s mark out of note ${note.id}`,
			failure
		);
	}
}

/**
 * Resolves a top-level comment's thread, or with `resolved` false opens it again. Anyone who
 * can comment on the note may; a reply has no thread of its own to resolve. The comment's
 * author is told.
 */
export async function setNoteCommentResolved(
	env: Env,
	who: SignedIn,
	note: LoadedNote,
	commentId: string,
	resolved: boolean,
	now = Date.now()
) {
	requireDiscuss(who);
	const comment = await loadNoteComment(env, note, commentId);
	if (comment.parentId !== null) error(400, strings.errors.cannotResolveReply);
	await db(env)
		.update(schema.noteComments)
		.set({ resolvedAt: resolved ? now : null, resolvedBy: resolved ? who.user.id : null })
		.where(eq(schema.noteComments.id, commentId));
	if (resolved) {
		await emit(env, {
			kind: 'comment.resolved',
			commentId,
			subjectType: 'note',
			resolvedBy: who.user.id
		});
	}
	await publish(env, `note:${note.id}`, {
		type: resolved ? 'comment.resolved' : 'comment.unresolved',
		noteId: note.id,
		commentId
	});
}

/** Adds this member's reaction to the note or one of its comments, or removes it if there. */
export async function toggleNoteReaction(
	env: Env,
	who: SignedIn,
	note: LoadedNote,
	subject: { type: NoteReactionSubject; id: string },
	emoji: string
) {
	await assertReaction(env, emoji);
	requireDiscuss(who);
	if (subject.type === 'note' && subject.id !== note.id) error(404, strings.errors.noteNotFound);
	if (subject.type === 'comment') await loadNoteComment(env, note, subject.id);
	const { noteReactions } = schema;
	const mine = and(
		eq(noteReactions.subjectType, subject.type),
		eq(noteReactions.subjectId, subject.id),
		eq(noteReactions.userId, who.user.id),
		eq(noteReactions.emoji, emoji)
	);
	const existing = await db(env)
		.select({ id: noteReactions.id })
		.from(noteReactions)
		.where(mine)
		.get();
	if (existing) {
		await db(env).delete(noteReactions).where(eq(noteReactions.id, existing.id));
		await retractReaction(env, existing.id);
	} else {
		const id = newId();
		await db(env).insert(noteReactions).values({
			id,
			subjectType: subject.type,
			subjectId: subject.id,
			userId: who.user.id,
			emoji,
			createdAt: Date.now()
		});
		// Only the note itself: a note comment has no ContentKind of its own.
		if (subject.type === 'note') {
			await emit(env, {
				kind: 'reaction.created',
				reactionId: id,
				subjectType: 'note',
				subjectId: note.id,
				authorId: who.user.id
			});
		}
	}
	await publish(env, `note:${note.id}`, { type: 'reactions.changed', noteId: note.id });
}

/**
 * The reactions on a note and on its comments, per subject id, as the Reactions component reads
 * them. One query that needs no comment ids, so it runs beside listNoteComments.
 */
export async function noteReactionSummaries(
	env: Env,
	viewerId: string,
	noteId: string
): Promise<Record<string, ReactionSummary[]>> {
	const { noteReactions, users, noteComments } = schema;
	const rows = await db(env)
		.select({
			subjectId: noteReactions.subjectId,
			emoji: noteReactions.emoji,
			userId: noteReactions.userId,
			name: users.name
		})
		.from(noteReactions)
		.innerJoin(users, eq(users.id, noteReactions.userId))
		.where(
			or(
				and(eq(noteReactions.subjectType, 'note'), eq(noteReactions.subjectId, noteId)),
				and(
					eq(noteReactions.subjectType, 'comment'),
					inArray(
						noteReactions.subjectId,
						db(env)
							.select({ id: noteComments.id })
							.from(noteComments)
							.where(eq(noteComments.noteId, noteId))
					)
				)
			)
		)
		.orderBy(asc(noteReactions.createdAt));
	return summarizeReactions(rows, viewerId);
}
