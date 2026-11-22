import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import { loadThread } from '../chat/threads';
import { calls as strings } from '../../strings/calls';
import { roomPathOfUser } from './rooms';

/** Where a call happens: a project, a chat thread, or a member's personal room (the owner's user id). */
export type CallPlace = { kind: 'project' | 'thread' | 'room'; id: string };

/** The place a call row belongs to; the table's CHECK sets exactly one of the three. */
export function placeOf(call: typeof schema.calls.$inferSelect): CallPlace {
	if (call.projectId) return { kind: 'project', id: call.projectId };
	if (call.threadId) return { kind: 'thread', id: call.threadId };
	return { kind: 'room', id: call.roomOwnerId! };
}

/**
 * A call's place as this person sees it: its name and its page. Call it only for someone
 * who can see the call, who may see where it was; project and room names are read
 * directly, so someone who was in an ended call still sees which project it was in after
 * leaving that project.
 */
export async function placeLink(env: Env, who: SignedIn, place: CallPlace) {
	const { projects, users } = schema;
	switch (place.kind) {
		case 'project': {
			const project = await db(env)
				.select({ name: projects.name })
				.from(projects)
				.where(eq(projects.id, place.id))
				.get();
			return { name: project!.name, href: `/projects/${place.id}` };
		}
		case 'thread':
			return { name: (await loadThread(env, who, place.id)).name, href: `/chat/${place.id}` };
		case 'room': {
			const owner = await db(env)
				.select({ name: users.name })
				.from(users)
				.where(eq(users.id, place.id))
				.get();
			const s = strings.personalRoom;
			const name = place.id === who.user.id ? s.yours : s.of(owner!.name);
			return { name, href: await roomPathOfUser(env, place.id) };
		}
	}
}
