import {
	and,
	countDistinct,
	eq,
	inArray,
	isNull,
	not,
	or,
	sql,
	type SQL,
	type SQLWrapper
} from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { QueryBuilder, type SQLiteTable } from 'drizzle-orm/sqlite-core';
import { visibleCalls } from '../calls/history';
import { db, schema } from '../db';
import type { Role } from '../db/schema';
import type { FollowUpSubject } from '../db/schema/follow-ups';
import type { NotificationKind } from '../db/schema/notifications';
import { followUpItemKey } from '../follow-ups';
import { newId } from '../id';
import { visibleNoteIds } from '../notes/access';
import { feedbackItemKey } from '../posts/feedback';
import { publish } from '../realtime/publish';
import { sendPush } from '../push/webpush';
import { notifications as strings } from '../../strings/notifications';
import { pushPayload } from './preview';
import { summarize, type Facts } from './summary';
import { getSettings } from './settings';
import { isQuiet, quietNow, quietRules } from './quiet';

export type NewNotification = {
	actorId: string;
	kind: NotificationKind;
	/** Groups notifications about one item in the inbox: 'post:<id>', 'thread:<id>', 'note:<id>'. */
	itemKey: string;
	url: string;
	/** The item's title, shown under the line; null when the event's module gives none. */
	title: string | null;
	/** What the sentence is about; null for the kinds with none of their own (messages, calls, join requests). */
	facts: Facts | null;
	/** What push and mail quote under the sentence (preview.ts); none for a kind with no body. */
	preview?: string | null;
	/** The event behind it; a person is notified once per source, so retries are safe. */
	source: string;
};

/** The topic a person's browser subscribes to for their live unread count. */
export const userTopic = (userId: string) => `user:${userId}`;

/** Reactions to one post, comment or note are one inbox item. */
export const reactionsItemKey = (subjectType: string, subjectId: string) =>
	`reactions:${subjectType}:${subjectId}`;

/** The source of one reaction's notification, by which retractReaction takes it back. */
export const reactionSource = (reactionId: string) => `reaction.created:${reactionId}`;

/** Unread inbox rows: notifications about one item are one row, so they count once. */
export async function unreadCount(env: Env, userId: string): Promise<number> {
	const { notifications } = schema;
	const row = await db(env)
		.select({ n: countDistinct(notifications.itemKey) })
		.from(notifications)
		.where(
			and(
				eq(notifications.userId, userId),
				isNull(notifications.readAt),
				isNull(notifications.archivedAt)
			)
		)
		.get();
	return row?.n ?? 0;
}

export async function publishUnreadCount(env: Env, userId: string): Promise<void> {
	await publish(env, userTopic(userId), {
		type: 'inbox.unread',
		count: await unreadCount(env, userId)
	});
}

/**
 * Stores one notification for each recipient, except the actor and anyone deactivated, then
 * updates their live unread count and pushes it to their devices. Returns who was notified.
 * A reminder is the exception: its actor is the person who set it, and it is for them.
 * `anyway` pushes through quiet hours and pauses, as a reminder that asked for it does.
 */
export async function notify(
	env: Env,
	recipientIds: string[],
	notification: NewNotification,
	now = Date.now(),
	{ anyway = false } = {}
): Promise<string[]> {
	const candidates = [...new Set(recipientIds)].filter(
		(id) => notification.kind === 'follow_up' || id !== notification.actorId
	);
	if (candidates.length === 0) return [];
	const { members, notifications, users } = schema;
	const active = await db(env)
		.select({ userId: members.userId })
		.from(members)
		.where(and(inArray(members.userId, candidates), isNull(members.deactivatedAt)));
	const actor = await db(env)
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, notification.actorId))
		.get();
	const { facts, ...stored } = notification;
	const summary = facts && summarize(actor!.name, facts);
	const title = summary ?? strings.line(actor!.name, notification.kind, notification.itemKey);
	const notified: string[] = [];
	const quiet = new Set<string>();
	const rules = await quietRules(
		env,
		active.map((row) => row.userId)
	);
	for (const { userId } of active) {
		// Made while they're quiet: it's in the inbox, says it was held, and is never emailed,
		// then or later.
		const held = !anyway && isQuiet(rules.get(userId)!, now);
		const inserted = await db(env)
			.insert(notifications)
			.values({
				id: newId(now),
				userId,
				...stored,
				summary,
				emoji: facts?.about === 'reaction' ? facts.emoji : null,
				createdAt: now,
				emailedAt: held ? now : null,
				heldAt: held ? now : null
			})
			.onConflictDoNothing()
			.returning({ id: notifications.id });
		if (inserted.length) notified.push(userId);
		if (held) quiet.add(userId);
	}
	if (notified.length === 0) return [];

	// The rows are stored, so a retry won't reach anyone again: tell everyone first, then fail
	// with every push error at once.
	const pushFailures: string[] = [];
	for (const userId of notified) {
		const unread = await unreadCount(env, userId);
		const payload = pushPayload(notification, title, unread);
		// A reaction or a notification made in quiet hours doesn't interrupt an open tab either.
		if (notification.kind !== 'reaction' && !quiet.has(userId)) {
			await publish(env, userTopic(userId), {
				type: 'new-notification',
				title: payload.title,
				body: payload.body,
				url: payload.url
			});
		}
		await publish(env, userTopic(userId), { type: 'inbox.unread', count: unread });
		pushFailures.push(
			...(await pushTo(env, userId, notification.kind, payload, now, { anyway })).failures
		);
	}
	if (pushFailures.length) throw new Error(pushFailures.join('; '));
	return notified;
}

/**
 * Takes back the notification of a reaction that was removed, and updates its reader's unread
 * count. One that hasn't been made yet never will be: the job checks the reaction is still there.
 */
export async function retractReaction(env: Env, reactionId: string): Promise<void> {
	const { notifications } = schema;
	const removed = await db(env)
		.delete(notifications)
		.where(eq(notifications.source, reactionSource(reactionId)))
		.returning({ userId: notifications.userId });
	for (const { userId } of removed) await publishUnreadCount(env, userId);
}

/**
 * What is being deleted: a post (with its comments), a comment (with its replies), a note, or
 * a note's comment (with its replies).
 */
export type DeletedContent =
	{ post: string } | { comment: string } | { note: string } | { noteComment: string };

/**
 * Deletes content with its notifications, so no inbox row, unread email or digest links to it,
 * then updates the unread count of everyone who had one. The notifications go first in the same
 * batch: deleting a post cascades its feedback requests and comments away, and triggers delete
 * the reminders on them.
 */
export async function deleteWithNotifications(
	env: Env,
	deleted: DeletedContent,
	deleteContent: BatchItem<'sqlite'>
): Promise<void> {
	const { notifications } = schema;
	const [removed] = await db(env).batch([
		db(env)
			.delete(notifications)
			.where(notificationsAbout(deleted))
			.returning({ userId: notifications.userId }),
		deleteContent
	]);
	for (const userId of new Set(removed.map((row) => row.userId))) {
		await publishUnreadCount(env, userId);
	}
}

/**
 * Matches the notifications about deleted content. Ids are selected in SQL, never bound one by
 * one, because D1 binds at most 100 parameters and a post can have more comments than that.
 */
function notificationsAbout(deleted: DeletedContent): SQL {
	const { notifications: n, comments } = schema;
	if ('noteComment' in deleted) {
		const { noteComments } = schema;
		const sources = (prefix: string) =>
			subquery
				.select({ key: prefixed(prefix, noteComments.id) })
				.from(noteComments)
				.where(
					or(
						eq(noteComments.id, deleted.noteComment),
						eq(noteComments.parentId, deleted.noteComment)
					)
				);
		return or(
			inArray(n.source, sources('note-comment:')),
			inArray(n.source, sources('comment.resolved:'))
		)!;
	}
	if ('note' in deleted) {
		return or(
			eq(n.itemKey, `note:${deleted.note}`),
			eq(n.itemKey, reactionsItemKey('note', deleted.note)),
			inArray(n.itemKey, reminderKeys('note', [deleted.note]))
		)!;
	}
	if ('comment' in deleted) {
		const { comment } = deleted;
		const withReplies = or(eq(comments.id, comment), eq(comments.parentId, comment));
		const sources = (prefix: string) =>
			subquery
				.select({ key: prefixed(prefix, comments.id) })
				.from(comments)
				.where(withReplies);
		return or(
			inArray(n.itemKey, reminderKeys('comment', commentIds(withReplies))),
			inArray(n.itemKey, sources(reactionsItemKey('comment', ''))),
			inArray(n.source, sources('comment.created:')),
			inArray(n.source, sources('comment.resolved:')),
			inArray(n.source, sources('mention:comment:'))
		)!;
	}
	const { postFeedbackRequests: requests } = schema;
	const { post } = deleted;
	const feedbackKeys = subquery
		.select({ key: prefixed(feedbackItemKey(''), requests.id) })
		.from(requests)
		.where(eq(requests.postId, post));
	const commentReactionKeys = subquery
		.select({ key: prefixed(reactionsItemKey('comment', ''), comments.id) })
		.from(comments)
		.where(eq(comments.postId, post));
	return or(
		eq(n.itemKey, `post:${post}`),
		eq(n.itemKey, reactionsItemKey('post', post)),
		inArray(n.itemKey, commentReactionKeys),
		inArray(n.itemKey, feedbackKeys),
		inArray(n.itemKey, reminderKeys('post', [post])),
		inArray(n.itemKey, reminderKeys('comment', commentIds(eq(comments.postId, post))))
	)!;
}

/** The inbox item of being added to a project. */
export const projectItemKey = (projectId: string) => `project:${projectId}`;

/**
 * Deletes one person's notifications about a project they were taken off: the one that added
 * them, and, with `content`, those about its posts, notes and calls that they can no longer see.
 * Run it after their membership is deleted, in the same batch, so the SQL sees them as a
 * non-member. Ids are selected in SQL, never bound. A future "make private" action must run
 * this with `content` for every non-member.
 */
export function discardProjectNotifications(
	env: Env,
	person: { user: { id: string }; member: { role: Role } },
	projectId: string,
	{ content }: { content: boolean }
) {
	const {
		notifications: n,
		posts,
		comments,
		notes,
		calls,
		postFeedbackRequests: requests
	} = schema;
	const postIds = subquery
		.select({ id: posts.id })
		.from(posts)
		.where(eq(posts.projectId, projectId));
	const hiddenNotes = and(eq(notes.projectId, projectId), not(visibleNoteIds(person)));
	const hiddenNoteIds = subquery.select({ id: notes.id }).from(notes).where(hiddenNotes);
	const hiddenCallIds = subquery
		.select({ id: calls.id })
		.from(calls)
		.where(and(eq(calls.projectId, projectId), sql`NOT coalesce(${visibleCalls(env, person)}, 0)`));
	const itemsOf = (prefix: string, id: SQLWrapper, table: SQLiteTable, where: SQL | undefined) =>
		inArray(
			n.itemKey,
			subquery
				.select({ key: prefixed(prefix, id) })
				.from(table)
				.where(where)
		);
	const about = or(
		itemsOf('post:', posts.id, posts, eq(posts.projectId, projectId)),
		itemsOf(reactionsItemKey('post', ''), posts.id, posts, eq(posts.projectId, projectId)),
		itemsOf(
			reactionsItemKey('comment', ''),
			comments.id,
			comments,
			inArray(comments.postId, postIds)
		),
		itemsOf(feedbackItemKey(''), requests.id, requests, inArray(requests.postId, postIds)),
		inArray(n.itemKey, reminderKeys('post', postIds)),
		inArray(n.itemKey, reminderKeys('comment', commentIds(inArray(comments.postId, postIds)))),
		itemsOf('note:', notes.id, notes, hiddenNotes),
		itemsOf(reactionsItemKey('note', ''), notes.id, notes, hiddenNotes),
		inArray(n.itemKey, reminderKeys('note', hiddenNoteIds)),
		inArray(n.itemKey, reminderKeys('call', hiddenCallIds))
	);
	return db(env)
		.delete(n)
		.where(
			and(
				eq(n.userId, person.user.id),
				or(eq(n.itemKey, projectItemKey(projectId)), content ? about : undefined)
			)
		);
}

const subquery = new QueryBuilder();

const prefixed = (prefix: string, id: SQLWrapper) => sql<string>`${prefix} || ${id}`;

const commentIds = (where: SQL | undefined) =>
	subquery.select({ id: schema.comments.id }).from(schema.comments).where(where);

/** The inbox item keys of everyone's reminders on these subjects. */
function reminderKeys(type: FollowUpSubject, ids: string[] | SQLWrapper) {
	const { followUps } = schema;
	return subquery
		.select({ key: prefixed(followUpItemKey(''), followUps.id) })
		.from(followUps)
		.where(and(eq(followUps.subjectType, type), inArray(followUps.subjectId, ids)));
}

/**
 * Pushes to each of a person's devices, if they let this kind be pushed and aren't in their
 * quiet hours, unless the sender chose "Notify anyway". Returns how many devices took it and
 * the errors of those that failed.
 */
export async function pushTo(
	env: Env,
	userId: string,
	kind: NotificationKind,
	payload: { title: string; body: string | null; url: string; unread: number },
	now = Date.now(),
	{ anyway = false } = {}
): Promise<{ sent: number; failures: string[] }> {
	// A deployment without VAPID keys (local development, or before script/deploy) has no push.
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { sent: 0, failures: [] };
	const settings = await getSettings(env, userId);
	if (!settings.pushKinds.includes(kind)) return { sent: 0, failures: [] };
	if (!anyway && (await quietNow(env, userId, now))) return { sent: 0, failures: [] };
	const { pushSubscriptions } = schema;
	const subscriptions = await db(env)
		.select()
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.userId, userId));
	const keys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
	let sent = 0;
	const failures: string[] = [];
	for (const subscription of subscriptions) {
		try {
			const result = await sendPush(subscription, payload, keys, vapidSubject(env.EMAIL_FROM));
			if (result === 'expired') {
				await db(env).delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
			} else sent++;
		} catch (cause) {
			failures.push(cause instanceof Error ? cause.message : String(cause));
		}
	}
	return { sent, failures };
}

/** VAPID's contact: the mailto: of the address in EMAIL_FROM ("Name <a@b>" or "a@b"). */
export function vapidSubject(emailFrom: string): string {
	const address = /<([^>]+)>/.exec(emailFrom)?.[1] ?? emailFrom.trim();
	return `mailto:${address}`;
}
