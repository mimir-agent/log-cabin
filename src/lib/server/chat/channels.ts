// A chat channel is the one thread of a project made with "Chat format". Who is in it is
// whoever is in the project: 0026_chat2.sql's triggers keep the thread's people in step with
// project_members, and this file does what a trigger can't, which is talk to the hub.
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import { unsubscribeUser } from '../realtime/publish';

/** The thread of a project's chat, when it has one and this member is in the project. */
export async function channelThreadId(
	env: Env,
	who: SignedIn,
	projectId: string
): Promise<string | null> {
	const { chatThreads: t, chatThreadMembers: m } = schema;
	const row = await db(env)
		.select({ id: t.id })
		.from(t)
		.innerJoin(m, and(eq(m.threadId, t.id), eq(m.userId, who.user.id)))
		.where(eq(t.projectId, projectId))
		.get();
	return row?.id ?? null;
}

/**
 * After someone leaves or is removed from a project: their inbox rows for its chat go and
 * their open pages stop hearing it. The thread itself 404s for them once the trigger has
 * taken them out of it.
 */
export async function dropFromChannel(env: Env, projectId: string, userId: string) {
	const { chatThreads: t, notifications: n } = schema;
	const channel = await db(env)
		.select({ id: t.id })
		.from(t)
		.where(eq(t.projectId, projectId))
		.get();
	if (!channel) return;
	await db(env)
		.delete(n)
		.where(and(eq(n.userId, userId), eq(n.itemKey, `thread:${channel.id}`)));
	await unsubscribeUser(env, userId, `thread:${channel.id}`);
}
