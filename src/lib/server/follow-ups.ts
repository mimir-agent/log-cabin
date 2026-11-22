import { error, isHttpError } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { db, schema } from './db';
import type { FollowUpSubject } from './db/schema/follow-ups';
import { newId } from './id';
import type { SignedIn } from './auth/session';
import { loadPost } from './posts/posts';
import { loadNote } from './notes/access';
import { canSeeCall } from './calls/calls';
import { placeLink, placeOf } from './calls/places';
import { notify, publishUnreadCount } from './notifications/notify';
import { posts as strings } from '../strings/posts';
import { notes as noteStrings } from '../strings/notes';
import { calls as callStrings } from '../strings/calls';

/** The inbox item a due reminder is shown as. */
export const followUpItemKey = (id: string) => `follow_up:${id}`;
/** The reminder id in a due reminder's item key: the inverse of followUpItemKey. */
export const followUpIdOf = (itemKey: string) => itemKey.replace(/^follow_up:/, '');

/** The furthest ahead a reminder may be set, as in the custom date picker. */
const maxAheadMs = 366 * 24 * 60 * 60 * 1000;

/** The subject's title and page as this person sees it, 404ing when they can't see it. */
async function loadSubjectLink(env: Env, who: SignedIn, type: FollowUpSubject, id: string) {
	switch (type) {
		case 'post': {
			const post = await loadPost(env, who, id);
			return { title: post.title, url: `/posts/${id}` };
		}
		case 'comment': {
			const { comments } = schema;
			const comment = await db(env)
				.select({ postId: comments.postId })
				.from(comments)
				.where(eq(comments.id, id))
				.get();
			if (!comment) error(404, strings.errors.commentNotFound);
			const post = await loadPost(env, who, comment.postId);
			return { title: post.title, url: `/posts/${post.id}#comment-${id}` };
		}
		case 'note': {
			const note = await loadNote(env, who, id);
			return { title: note.title || noteStrings.editor.titlePlaceholder, url: `/notes/${id}` };
		}
		case 'call': {
			const call = await db(env).select().from(schema.calls).where(eq(schema.calls.id, id)).get();
			if (!call || !(await canSeeCall(env, who.user.id, who.member, call))) {
				error(404, callStrings.errors.callNotFound);
			}
			const place = await placeLink(env, who, placeOf(call));
			return { title: callStrings.room.title(place.name), url: `/calls/${id}` };
		}
	}
}

function assertShowAt(showAt: number, now: number) {
	if (!Number.isFinite(showAt) || showAt <= now || showAt > now + maxAheadMs) {
		error(400, strings.errors.followUpTimeInvalid);
	}
}

/** Archives the inbox item of a reminder that was shown, so a snoozed or finished one leaves it. */
async function clearInboxItem(env: Env, userId: string, id: string, now: number) {
	const { notifications } = schema;
	await db(env)
		.update(notifications)
		.set({ archivedAt: now, readAt: now })
		.where(
			and(
				eq(notifications.userId, userId),
				eq(notifications.itemKey, followUpItemKey(id)),
				isNull(notifications.archivedAt)
			)
		);
	await publishUnreadCount(env, userId);
}

/** Sets this person's reminder about something they can see, replacing one they had. */
export async function setFollowUp(
	env: Env,
	who: SignedIn,
	subject: { type: FollowUpSubject; id: string },
	showAt: number,
	notifyAnyway: boolean,
	now = Date.now()
) {
	assertShowAt(showAt, now);
	const link = await loadSubjectLink(env, who, subject.type, subject.id);
	const { followUps } = schema;
	const [row] = await db(env)
		.insert(followUps)
		.values({
			id: newId(now),
			userId: who.user.id,
			subjectType: subject.type,
			subjectId: subject.id,
			...link,
			showAt,
			notifyAnyway,
			createdAt: now
		})
		.onConflictDoUpdate({
			target: [followUps.userId, followUps.subjectType, followUps.subjectId],
			set: { ...link, showAt, notifyAnyway, shownAt: null }
		})
		.returning({ id: followUps.id });
	await clearInboxItem(env, who.user.id, row.id, now);
}

/** Moves one of this person's reminders to a later time; it leaves the inbox until then. */
export async function snoozeFollowUp(
	env: Env,
	userId: string,
	id: string,
	showAt: number,
	notifyAnyway: boolean,
	now = Date.now()
) {
	assertShowAt(showAt, now);
	const { followUps } = schema;
	const [row] = await db(env)
		.update(followUps)
		.set({ showAt, notifyAnyway, shownAt: null })
		.where(and(eq(followUps.id, id), eq(followUps.userId, userId)))
		.returning({ id: followUps.id });
	if (!row) error(404, strings.errors.followUpNotFound);
	await clearInboxItem(env, userId, id, now);
}

/** Done with a reminder, or no longer wanting it: it goes, and so does its inbox item. */
export async function finishFollowUp(env: Env, userId: string, id: string, now = Date.now()) {
	const { followUps } = schema;
	const [row] = await db(env)
		.delete(followUps)
		.where(and(eq(followUps.id, id), eq(followUps.userId, userId)))
		.returning({ id: followUps.id });
	if (!row) error(404, strings.errors.followUpNotFound);
	await clearInboxItem(env, userId, id, now);
}

/** This person's reminders on any of these subjects, by subject id. */
export async function viewerFollowUps(env: Env, userId: string, subjectIds: string[]) {
	const { followUps } = schema;
	const rows = await db(env)
		.select({ id: followUps.id, subjectId: followUps.subjectId, showAt: followUps.showAt })
		.from(followUps)
		.where(and(eq(followUps.userId, userId), inArray(followUps.subjectId, subjectIds)));
	return Object.fromEntries(rows.map(({ subjectId, ...row }) => [subjectId, row]));
}

/** This person's reminders still to come, soonest first. */
export async function upcomingFollowUps(env: Env, userId: string) {
	const { followUps } = schema;
	return db(env)
		.select({
			id: followUps.id,
			subjectType: followUps.subjectType,
			title: followUps.title,
			url: followUps.url,
			showAt: followUps.showAt
		})
		.from(followUps)
		.where(and(eq(followUps.userId, userId), isNull(followUps.shownAt)))
		.orderBy(asc(followUps.showAt));
}

/** A reminder's owner as the access checks take them; null once they're deactivated. */
async function activeViewer(env: Env, userId: string): Promise<SignedIn | null> {
	const { members, users } = schema;
	const row = await db(env)
		.select({ user: users, member: members })
		.from(users)
		.innerJoin(members, eq(members.userId, users.id))
		.where(and(eq(users.id, userId), isNull(members.deactivatedAt)))
		.get();
	if (!row) return null;
	return {
		user: {
			id: row.user.id,
			name: row.user.name,
			username: row.user.username,
			email: row.user.email,
			avatarUrl: null,
			theme: row.user.theme
		},
		member: { id: row.member.id, role: row.member.role }
	};
}

/** The subject's title and page as its owner sees it now; null once they can't see it. */
async function linkAtDelivery(env: Env, userId: string, type: FollowUpSubject, id: string) {
	const viewer = await activeViewer(env, userId);
	if (!viewer) return null;
	return loadSubjectLink(env, viewer, type, id).catch((cause: unknown) => {
		if (isHttpError(cause, 404)) return null;
		throw cause;
	});
}

/**
 * Every 5 minutes: puts each reminder whose time has come in its owner's inbox, which also
 * pushes it if they let reminders be pushed. A reminder is shown once per time it's set for,
 * and only if its owner can still see what it's about.
 */
export async function deliverFollowUps(env: Env, now: number): Promise<void> {
	const { followUps } = schema;
	const due = await db(env)
		.select()
		.from(followUps)
		.where(and(isNull(followUps.shownAt), lte(followUps.showAt, now)));
	const failures: string[] = [];
	for (const followUp of due) {
		await db(env).update(followUps).set({ shownAt: now }).where(eq(followUps.id, followUp.id));
		// notify() stores the row before it pushes, so a failed push still leaves the reminder
		// in the inbox; the others go out before the failures are reported.
		await linkAtDelivery(env, followUp.userId, followUp.subjectType, followUp.subjectId)
			.then(
				(link) =>
					link &&
					notify(
						env,
						[followUp.userId],
						{
							actorId: followUp.userId,
							kind: 'follow_up',
							itemKey: followUpItemKey(followUp.id),
							...link,
							facts: { about: 'follow_up', title: link.title },
							source: `follow_up:${followUp.id}:${followUp.showAt}`
						},
						now,
						{ anyway: followUp.notifyAnyway }
					)
			)
			.catch((cause: unknown) => failures.push(`reminder ${followUp.id}: ${String(cause)}`));
	}
	if (failures.length) throw new Error(`deliverFollowUps: ${failures.join('; ')}`);
}
