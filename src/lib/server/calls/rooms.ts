import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { lookUpUsername } from '../people/usernames';

// Every member has a permanent personal room at /calls/room/<username>. roomSlug and
// resolveRoomSlug are the only places that know the slug is the username.

/** The slug in a member's room URL. */
export const roomSlug = (person: { username: string }) => person.username;

export const roomPath = (person: { username: string }) => `/calls/room/${roomSlug(person)}`;

export type RoomOwner = { memberId: string; userId: string; name: string };

/**
 * The active member whose room the slug names; for a username changed in the last 30 days,
 * the slug to redirect to; otherwise null.
 */
export async function resolveRoomSlug(
	env: Env,
	slug: string,
	now = Date.now()
): Promise<RoomOwner | { redirectTo: string } | null> {
	const found = await lookUpUsername(env, slug, now);
	if (!found || 'redirectTo' in found) return found;
	const { members, users } = schema;
	const owner = await db(env)
		.select({ memberId: members.id, userId: users.id, name: users.name })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(and(eq(users.id, found.userId), isNull(members.deactivatedAt)))
		.get();
	return owner ?? null;
}

/** The room path of the person with this user id. */
export async function roomPathOfUser(env: Env, userId: string): Promise<string> {
	const user = await db(env)
		.select({ username: schema.users.username })
		.from(schema.users)
		.where(eq(schema.users.id, userId))
		.get();
	if (!user) throw new Error(`roomPathOfUser: expected a user with id ${userId}, found none`);
	return roomPath(user);
}
