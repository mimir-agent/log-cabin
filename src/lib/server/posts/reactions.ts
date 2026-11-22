import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { db, schema } from '../db';
import type { ReactionSubject } from '../db/schema';
import { newId } from '../id';
import { emit } from '../events';
import { retractReaction } from '../notifications/notify';
import { publish } from '../realtime/publish';
import type { SignedIn } from '../auth/session';
import { posts as strings } from '../../strings/posts';
import { emojiNamePattern } from '../../editor/inline';
import { loadWritableProject } from './access';
import type { LoadedPost } from './posts';

// One emoji: a pictograph, optionally with skin tone, variation selectors and joiners.
const singleEmoji =
	/^\p{Extended_Pictographic}(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200d|\ufe0f)*$/u;

/**
 * Refuses anything but one Unicode emoji or the :name: of one of the org's own emoji, the
 * two things a reaction can be.
 */
export async function assertReaction(env: Env, emoji: string) {
	if (singleEmoji.test(emoji)) return;
	const name = emoji.slice(1, -1);
	const isName = emoji === `:${name}:` && emojiNamePattern.test(name);
	const { customEmoji } = schema;
	const found =
		isName &&
		(await db(env)
			.select({ id: customEmoji.id })
			.from(customEmoji)
			.where(eq(customEmoji.name, name))
			.get());
	if (!found) error(400, strings.errors.emojiInvalid);
}

export type ReactionSummary = { emoji: string; count: number; names: string[]; mine: boolean };

/**
 * Adds this member's reaction, or removes it when it's already there. subjectId is the
 * post itself or one of its comments.
 */
export async function toggleReaction(
	env: Env,
	who: SignedIn,
	post: LoadedPost,
	subject: { type: ReactionSubject; id: string },
	emoji: string
) {
	await assertReaction(env, emoji);
	await loadWritableProject(env, who, post.projectId);
	if (
		subject.type === 'post' ? subject.id !== post.id : !(await isCommentOf(env, post, subject.id))
	) {
		error(404, strings.errors.commentNotFound);
	}
	const { reactions } = schema;
	const mine = and(
		eq(reactions.subjectType, subject.type),
		eq(reactions.subjectId, subject.id),
		eq(reactions.userId, who.user.id),
		eq(reactions.emoji, emoji)
	);
	const existing = await db(env).select({ id: reactions.id }).from(reactions).where(mine).get();
	if (existing) {
		await db(env).delete(reactions).where(eq(reactions.id, existing.id));
		await retractReaction(env, existing.id);
	} else {
		const id = newId();
		await db(env).insert(reactions).values({
			id,
			subjectType: subject.type,
			subjectId: subject.id,
			userId: who.user.id,
			emoji,
			createdAt: Date.now()
		});
		await emit(env, {
			kind: 'reaction.created',
			reactionId: id,
			subjectType: subject.type,
			subjectId: subject.id,
			authorId: who.user.id
		});
	}
	await publish(env, `post:${post.id}`, { type: 'reactions.changed', postId: post.id });
}

async function isCommentOf(env: Env, post: LoadedPost, commentId: string) {
	const { comments } = schema;
	const row = await db(env)
		.select({ id: comments.id })
		.from(comments)
		.where(and(eq(comments.id, commentId), eq(comments.postId, post.id)))
		.get();
	return !!row;
}

/**
 * The reactions on a post and on its comments, per subject id, each emoji in the order it was
 * first used, with who reacted. One query that needs no comment ids, so it runs beside listComments.
 */
export async function reactionSummaries(
	env: Env,
	viewerId: string,
	postId: string
): Promise<Record<string, ReactionSummary[]>> {
	const { reactions, users, comments } = schema;
	const rows = await db(env)
		.select({
			subjectId: reactions.subjectId,
			emoji: reactions.emoji,
			userId: reactions.userId,
			name: users.name
		})
		.from(reactions)
		.innerJoin(users, eq(users.id, reactions.userId))
		.where(
			or(
				and(eq(reactions.subjectType, 'post'), eq(reactions.subjectId, postId)),
				and(
					eq(reactions.subjectType, 'comment'),
					inArray(
						reactions.subjectId,
						db(env).select({ id: comments.id }).from(comments).where(eq(comments.postId, postId))
					)
				)
			)
		)
		.orderBy(asc(reactions.createdAt));
	return summarizeReactions(rows, viewerId);
}

/** Folds reaction rows, oldest first, into one summary per emoji per subject id. */
export function summarizeReactions(
	rows: { subjectId: string; emoji: string; userId: string; name: string }[],
	viewerId: string
): Record<string, ReactionSummary[]> {
	const out: Record<string, ReactionSummary[]> = {};
	for (const row of rows) {
		const list = (out[row.subjectId] ??= []);
		let summary = list.find((s) => s.emoji === row.emoji);
		if (!summary) list.push((summary = { emoji: row.emoji, count: 0, names: [], mine: false }));
		summary.count++;
		summary.names.push(row.name);
		summary.mine ||= row.userId === viewerId;
	}
	return out;
}
