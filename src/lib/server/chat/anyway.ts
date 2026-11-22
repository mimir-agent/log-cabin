// Adapted from Campsite (https://github.com/campsite/campsite), api/app/models/message_thread.rb, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/
// Adapted from Campsite (https://github.com/campsite/campsite), api/app/controllers/api/v1/message_threads/notification_forces_controller.rb, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/
// "Notify anyway", after Campsite's MessageThread#viewer_can_force_notification and
// NotificationForcesController (CC BY-NC 4.0): in a DM with someone whose notifications are held
// (paused, or outside their hours), the sender of the latest message may push it to them once.
import { error } from '@sveltejs/kit';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import { pushTo, unreadCount } from '../notifications/notify';
import { quietNow } from '../notifications/quiet';
import { chat as strings } from '../../strings/chat';
import { notifications as notificationStrings } from '../../strings/notifications';
import type { LoadedThread } from './threads';

/**
 * The other person in a DM while their notifications are held, and whether this member may
 * notify them anyway: they sent the latest message, and haven't since it. Null otherwise.
 */
export async function heldNotifications(
	env: Env,
	who: SignedIn,
	thread: LoadedThread,
	now = Date.now()
): Promise<{ name: string; canNotify: boolean } | null> {
	if (thread.kind !== 'dm') return null;
	const other = thread.people.find((p) => p.id !== who.user.id)!;
	if (!(await quietNow(env, other.id, now))) return null;
	const { messages } = schema;
	const latest = await db(env)
		.select({ authorId: messages.authorId, createdAt: messages.createdAt })
		.from(messages)
		.where(and(eq(messages.threadId, thread.id), isNull(messages.deletedAt)))
		.orderBy(desc(messages.createdAt), desc(sql`${messages}.rowid`))
		.get();
	const canNotify =
		latest?.authorId === who.user.id &&
		(thread.notificationForcedAt === null || thread.notificationForcedAt < latest.createdAt);
	return { name: other.name, canNotify };
}

/** Pushes the latest message to the other person in the DM now, once; 403 when not allowed. */
export async function notifyAnyway(
	env: Env,
	who: SignedIn,
	thread: LoadedThread,
	now = Date.now()
): Promise<void> {
	const held = await heldNotifications(env, who, thread, now);
	if (!held?.canNotify) error(403, strings.errors.cannotNotifyAnyway);
	const other = thread.people.find((p) => p.id !== who.user.id)!;
	const { chatThreads } = schema;
	await db(env)
		.update(chatThreads)
		.set({ notificationForcedAt: now })
		.where(eq(chatThreads.id, thread.id));
	const payload = {
		title: notificationStrings.line(who.user.name, 'message', `thread:${thread.id}`),
		body: who.user.name,
		url: `/chat/${thread.id}`,
		unread: await unreadCount(env, other.id)
	};
	const { failures } = await pushTo(env, other.id, 'message', payload, now, { anyway: true });
	if (failures.length) throw new Error(`notify anyway: ${failures.join('; ')}`);
}
