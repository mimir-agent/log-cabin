import { error } from '@sveltejs/kit';
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '../id';
import { emit } from '../events';
import { publish } from '../realtime/publish';
import { publishUnreadCount } from '../notifications/notify';
import type { SignedIn } from '../auth/session';
import { posts as strings } from '../../strings/posts';
import { canSeeProject } from './access';
import type { LoadedPost } from './posts';

export type FeedbackStatus = 'waiting' | 'replied' | 'dismissed';

/** The inbox item a feedback request is shown as. */
export const feedbackItemKey = (requestId: string) => `feedback:${requestId}`;
/** The request id in a feedback item's key: the inverse of feedbackItemKey. */
export const feedbackRequestIdOf = (itemKey: string) => itemKey.replace(/^feedback:/, '');

/** Everyone asked for feedback on a post, by name, and where each stands. */
export async function listFeedbackRequests(env: Env, postId: string) {
	const { postFeedbackRequests: requests, users } = schema;
	const rows = await db(env)
		.select({
			id: requests.id,
			userId: requests.userId,
			name: users.name,
			repliedAt: requests.repliedAt,
			dismissedAt: requests.dismissedAt
		})
		.from(requests)
		.innerJoin(users, eq(users.id, requests.userId))
		.where(eq(requests.postId, postId))
		.orderBy(asc(users.name), asc(requests.id));
	return rows.map(({ repliedAt, dismissedAt, ...row }) => {
		const status: FeedbackStatus =
			repliedAt !== null ? 'replied' : dismissedAt !== null ? 'dismissed' : 'waiting';
		return { ...row, status };
	});
}

/** Who the post's author may ask: every other active member who can see the post's project. */
export async function feedbackCandidates(env: Env, post: LoadedPost) {
	const { members, projectMembers, users } = schema;
	const people = await db(env)
		.select({
			id: users.id,
			name: users.name,
			role: members.role,
			isMember: sql<number>`${projectMembers.userId} IS NOT NULL`
		})
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.leftJoin(
			projectMembers,
			and(eq(projectMembers.userId, members.userId), eq(projectMembers.projectId, post.projectId))
		)
		.where(isNull(members.deactivatedAt))
		.orderBy(asc(users.name));
	return people
		.filter((p) => p.id !== post.authorId)
		.filter((p) => canSeeProject(p, { ...post.project, isMember: !!p.isMember }))
		.map(({ id, name }) => ({ id, name }));
}

/**
 * The post's author asks these people for feedback. Someone already asked is left alone,
 * unless they dismissed it: then they are asked, and notified, again.
 */
export async function requestFeedback(
	env: Env,
	who: SignedIn,
	post: LoadedPost,
	userIds: string[],
	now = Date.now()
) {
	if (post.authorId !== who.user.id) error(403, strings.errors.notYourPost);
	if (userIds.length === 0) error(400, strings.errors.feedbackNobody);
	const candidates = new Set((await feedbackCandidates(env, post)).map((p) => p.id));
	const { postFeedbackRequests: requests } = schema;
	for (const userId of new Set(userIds)) {
		if (!candidates.has(userId)) error(400, strings.errors.feedbackCannotSee);
		const [asked] = await db(env)
			.insert(requests)
			.values({ id: newId(now), postId: post.id, userId, requestedBy: who.user.id, createdAt: now })
			.onConflictDoUpdate({
				target: [requests.postId, requests.userId],
				set: { dismissedAt: null, createdAt: now, requestedBy: who.user.id },
				setWhere: isNotNull(requests.dismissedAt)
			})
			.returning({ id: requests.id });
		if (asked) await emit(env, { kind: 'feedback.requested', requestId: asked.id });
	}
	await publish(env, `post:${post.id}`, { type: 'feedback', postId: post.id });
}

/** The author takes a request back; it leaves the asked person's inbox. */
export async function withdrawFeedbackRequest(
	env: Env,
	who: SignedIn,
	post: LoadedPost,
	requestId: string
) {
	if (post.authorId !== who.user.id) error(403, strings.errors.notYourPost);
	const { postFeedbackRequests: requests, notifications } = schema;
	const [removed] = await db(env)
		.delete(requests)
		.where(and(eq(requests.id, requestId), eq(requests.postId, post.id)))
		.returning({ userId: requests.userId });
	if (!removed) error(404, strings.errors.feedbackNotFound);
	await db(env)
		.delete(notifications)
		.where(
			and(
				eq(notifications.userId, removed.userId),
				eq(notifications.itemKey, feedbackItemKey(requestId))
			)
		);
	await publishUnreadCount(env, removed.userId);
	await publish(env, `post:${post.id}`, { type: 'feedback', postId: post.id });
}

/**
 * The person asked declines: the request shows as dismissed to the author, and its inbox item
 * is archived. It changes only the caller's own request, so it needs no access to the post.
 */
export async function dismissFeedbackRequest(
	env: Env,
	userId: string,
	requestId: string,
	now = Date.now()
) {
	const { postFeedbackRequests: requests, notifications } = schema;
	const [dismissed] = await db(env)
		.update(requests)
		.set({ dismissedAt: now })
		.where(and(eq(requests.id, requestId), eq(requests.userId, userId)))
		.returning({ postId: requests.postId });
	if (!dismissed) error(404, strings.errors.feedbackNotFound);
	await db(env)
		.update(notifications)
		.set({ archivedAt: now, readAt: now })
		.where(
			and(
				eq(notifications.userId, userId),
				eq(notifications.itemKey, feedbackItemKey(requestId)),
				isNull(notifications.archivedAt)
			)
		);
	await publishUnreadCount(env, userId);
	await publish(env, `post:${dismissed.postId}`, { type: 'feedback', postId: dismissed.postId });
}
