import { error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db, schema } from '../db';
import { newId } from '../id';
import { emit } from '../events';
import { publish } from '../realtime/publish';
import { deleteWithNotifications } from '../notifications/notify';
import type { SignedIn } from '../auth/session';
import { docMentions } from '../../editor/doc';
import { posts as strings } from '../../strings/posts';
import { core } from '../../strings/core';
import { getObjectUrl } from '../storage';
import { canWriteInProject, loadWritableProject } from './access';
import { emitMentions, type BodyInput, type LoadedPost } from './posts';

/** Where a comment is pinned: an image in its post, at fractions 0–1 of its width and height. */
export type CanvasPin = { attachmentId: string; x: number; y: number };

/** A post's comments, oldest first, each top-level comment followed by its replies. */
export async function listComments(env: Env, postId: string) {
	const { comments, users } = schema;
	const resolver = alias(users, 'resolver');
	const found = await db(env)
		.select({
			id: comments.id,
			parentId: comments.parentId,
			authorId: comments.authorId,
			authorName: users.name,
			authorAvatarKey: users.avatarKey,
			body: comments.body,
			createdAt: comments.createdAt,
			editedAt: comments.editedAt,
			resolvedAt: comments.resolvedAt,
			resolvedByName: resolver.name,
			attachmentId: comments.attachmentId,
			x: comments.x,
			y: comments.y
		})
		.from(comments)
		.innerJoin(users, eq(users.id, comments.authorId))
		.leftJoin(resolver, eq(resolver.id, comments.resolvedBy))
		.where(eq(comments.postId, postId))
		.orderBy(asc(comments.createdAt), asc(comments.id));
	const rows = found.map(({ authorAvatarKey, ...c }) => ({
		...c,
		authorAvatarUrl: authorAvatarKey ? getObjectUrl(authorAvatarKey) : null
	}));
	return rows
		.filter((c) => c.parentId === null)
		.map((c) => ({ ...c, replies: rows.filter((r) => r.parentId === c.id) }));
}

async function loadComment(env: Env, post: LoadedPost, commentId: string) {
	const comment = await db(env)
		.select()
		.from(schema.comments)
		.where(and(eq(schema.comments.id, commentId), eq(schema.comments.postId, post.id)))
		.get();
	if (!comment) error(404, strings.errors.commentNotFound);
	return comment;
}

/**
 * Replies attach to the top-level comment, so a reply to a reply joins the same thread. A
 * comment pinned to an image (pinComment) comes in with its pin; replies never have one.
 */
export async function createComment(
	env: Env,
	who: SignedIn,
	post: LoadedPost,
	input: BodyInput | (BodyInput & CanvasPin),
	replyTo: string | null,
	now = Date.now(),
	id = newId(now)
) {
	await loadWritableProject(env, who, post.projectId);
	// The same comment again, after the answer to the first one was lost: it's stored already.
	const prior = await db(env)
		.select({ authorId: schema.comments.authorId, postId: schema.comments.postId })
		.from(schema.comments)
		.where(eq(schema.comments.id, id))
		.get();
	if (prior) {
		if (prior.authorId !== who.user.id || prior.postId !== post.id) {
			error(409, core.errors.idRefused);
		}
		return id;
	}
	const parent = replyTo ? await loadComment(env, post, replyTo) : null;
	const { mentions, ...fields } = input;
	await db(env).batch([
		db(env)
			.insert(schema.comments)
			.values({
				id,
				postId: post.id,
				parentId: parent ? (parent.parentId ?? parent.id) : null,
				authorId: who.user.id,
				...fields,
				createdAt: now
			}),
		db(env).update(schema.posts).set({ lastActivityAt: now }).where(eq(schema.posts.id, post.id))
	]);
	await emit(env, {
		kind: 'comment.created',
		commentId: id,
		subjectId: post.id,
		authorId: who.user.id
	});
	await emitMentions(env, post.project, mentions, { type: 'comment', id }, who.user.id);
	await publish(env, `post:${post.id}`, {
		type: 'comment.created',
		postId: post.id,
		commentId: id
	});
	await publish(env, `project:${post.projectId}`, { type: 'post.activity', postId: post.id });
	return id;
}

export async function updateComment(
	env: Env,
	who: SignedIn,
	post: LoadedPost,
	commentId: string,
	input: BodyInput
) {
	const comment = await loadComment(env, post, commentId);
	if (comment.authorId !== who.user.id) error(403, strings.errors.notYourComment);
	await loadWritableProject(env, who, post.projectId);
	const { mentions, ...fields } = input;
	await db(env)
		.update(schema.comments)
		.set({ ...fields, editedAt: Date.now() })
		.where(eq(schema.comments.id, commentId));
	const before = new Set(docMentions(JSON.parse(comment.body)));
	const added = mentions.filter((id) => !before.has(id));
	await emitMentions(env, post.project, added, { type: 'comment', id: commentId }, who.user.id);
	await publish(env, `post:${post.id}`, { type: 'comment.updated', postId: post.id, commentId });
}

/**
 * Resolves a top-level comment's thread, or with `resolved` false opens it again. Anyone who can
 * comment on the post may; a reply has no thread of its own to resolve. The comment's author is
 * told.
 */
export async function setCommentResolved(
	env: Env,
	who: SignedIn,
	post: LoadedPost,
	commentId: string,
	resolved: boolean,
	now = Date.now()
) {
	if (!canWriteInProject(who.member, post.project)) error(403, strings.errors.cannotResolve);
	const comment = await loadComment(env, post, commentId);
	if (comment.parentId !== null) error(400, strings.errors.cannotResolveReply);
	await db(env)
		.update(schema.comments)
		.set({ resolvedAt: resolved ? now : null, resolvedBy: resolved ? who.user.id : null })
		.where(eq(schema.comments.id, commentId));
	if (resolved) {
		await emit(env, {
			kind: 'comment.resolved',
			commentId,
			subjectType: 'post',
			resolvedBy: who.user.id
		});
	}
	await publish(env, `post:${post.id}`, {
		type: resolved ? 'comment.resolved' : 'comment.unresolved',
		postId: post.id,
		commentId
	});
}

/** Authors delete their own comments, admins any; replies go with their comment. */
export async function deleteComment(env: Env, who: SignedIn, post: LoadedPost, commentId: string) {
	const comment = await loadComment(env, post, commentId);
	if (comment.authorId !== who.user.id && who.member.role !== 'admin') {
		error(403, strings.errors.notYourComment);
	}
	await deleteWithNotifications(
		env,
		{ comment: commentId },
		db(env).delete(schema.comments).where(eq(schema.comments.id, commentId))
	);
	await publish(env, `post:${post.id}`, { type: 'comment.deleted', postId: post.id, commentId });
}
