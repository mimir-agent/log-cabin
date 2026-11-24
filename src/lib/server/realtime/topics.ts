import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { canSeeProjectById } from '../posts/access';
import { isThreadMember } from '../chat/threads';
import { noteAccess, noteFacts } from '../notes/access';
import { canSeeCall, canSeePlace } from '../calls/calls';

/**
 * Whether this user may hear what's published to a topic. Only active members subscribe,
 * and only to: user:<their own id>, project:<id>, post:<id> and note:<id> they can see, thread:<id>
 * they belong to, call:<id> they can see, room:<owner id> they can join, and calls:live (which live calls changed: no
 * detail, so a page reloads what it may see). Every other topic is refused.
 */
export async function canSubscribe(env: Env, userId: string, topic: string): Promise<boolean> {
	const [kind, id] = topic.split(/:(.*)/s);
	const member = await db(env)
		.select({ role: schema.members.role })
		.from(schema.members)
		.where(and(eq(schema.members.userId, userId), isNull(schema.members.deactivatedAt)))
		.get();
	if (!member || !id) return false;
	switch (kind) {
		case 'user':
			return id === userId;
		case 'thread':
			return isThreadMember(env, id, userId);
		case 'project':
			return canSeeProjectById(env, member, userId, id);
		case 'post': {
			const post = await db(env)
				.select({ projectId: schema.posts.projectId })
				.from(schema.posts)
				.where(eq(schema.posts.id, id))
				.get();
			return !!post && canSeeProjectById(env, member, userId, post.projectId);
		}
		case 'note': {
			const note = await db(env).select().from(schema.notes).where(eq(schema.notes.id, id)).get();
			if (!note) return false;
			return noteAccess(await noteFacts(env, note, { userId, role: member.role })) !== 'none';
		}
		case 'call': {
			const call = await db(env).select().from(schema.calls).where(eq(schema.calls.id, id)).get();
			return !!call && canSeeCall(env, userId, member, call);
		}
		case 'calls':
			return id === 'live';
		case 'room':
			return canSeePlace(env, userId, member, { kind: 'room', id });
		default:
			return false;
	}
}
