import { and, asc, count, eq, isNull, like, ne } from 'drizzle-orm';
import { db, schema } from './db';
import type { Role } from './db/schema';
import { newId } from './id';
import { availableUsername, suggestUsername } from './people/usernames';
import { disconnectUser } from './realtime/publish';
import { auth } from '../strings/auth';

export type Outcome = { ok: true } | { ok: false; message: string };

export type MemberRow = {
	id: string;
	userId: string;
	name: string;
	username: string;
	email: string;
	avatarKey: string | null;
	coverKey: string | null;
	timezone: string;
	statusEmoji: string | null;
	statusText: string | null;
	statusExpiresAt: number | null;
	lastSeenAt: number | null;
	role: Role;
	deactivatedAt: number | null;
	createdAt: number;
};

const memberColumns = {
	id: schema.members.id,
	userId: schema.users.id,
	name: schema.users.name,
	username: schema.users.username,
	email: schema.users.email,
	avatarKey: schema.users.avatarKey,
	coverKey: schema.users.coverKey,
	timezone: schema.users.timezone,
	statusEmoji: schema.users.statusEmoji,
	statusText: schema.users.statusText,
	statusExpiresAt: schema.users.statusExpiresAt,
	lastSeenAt: schema.users.lastSeenAt,
	role: schema.members.role,
	deactivatedAt: schema.members.deactivatedAt,
	createdAt: schema.members.createdAt
};

/**
 * Makes someone a member and returns both ids. `existingUserId` is the users row of someone
 * waiting on a join request (`waitingRequester`): they keep it, and their request is closed.
 * Without it, a new user is created.
 */
export async function createMember(
	env: Env,
	input: { email: string; name: string; role: Role; existingUserId?: string | null },
	now = Date.now()
): Promise<{ memberId: string; userId: string }> {
	const d = db(env);
	const memberId = newId(now);
	const { existingUserId } = input;
	if (existingUserId) {
		await d.batch([
			d.insert(schema.members).values({
				id: memberId,
				userId: existingUserId,
				role: input.role,
				createdAt: now
			}),
			d.delete(schema.joinRequests).where(eq(schema.joinRequests.userId, existingUserId))
		]);
		return { memberId, userId: existingUserId };
	}
	const userId = newId(now);
	const username = await availableUsername(env, suggestUsername(input.name), now);
	await d.batch([
		d
			.insert(schema.users)
			.values({ id: userId, email: input.email, name: input.name, username, createdAt: now }),
		d.insert(schema.members).values({ id: memberId, userId, role: input.role, createdAt: now })
	]);
	return { memberId, userId };
}

/** Members whose name contains `query`, by name. Deactivated members only when asked for. */
export function listMembers(
	env: Env,
	{ query, includeDeactivated }: { query: string; includeDeactivated: boolean }
): Promise<MemberRow[]> {
	return db(env)
		.select(memberColumns)
		.from(schema.members)
		.innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
		.where(
			and(
				query ? like(schema.users.name, `%${query}%`) : undefined,
				includeDeactivated ? undefined : isNull(schema.members.deactivatedAt)
			)
		)
		.orderBy(asc(schema.users.name))
		.all();
}

export async function getMember(env: Env, memberId: string): Promise<MemberRow | undefined> {
	return db(env)
		.select(memberColumns)
		.from(schema.members)
		.innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
		.where(eq(schema.members.id, memberId))
		.get();
}

export async function getMemberByUserId(env: Env, userId: string): Promise<MemberRow | undefined> {
	return db(env)
		.select(memberColumns)
		.from(schema.members)
		.innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
		.where(eq(schema.users.id, userId))
		.get();
}

export async function memberIdForEmail(env: Env, email: string): Promise<string | undefined> {
	const row = await db(env)
		.select({ id: schema.members.id })
		.from(schema.members)
		.innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
		.where(eq(schema.users.email, email))
		.get();
	return row?.id;
}

/** True when `member` is an active admin and no other active admin exists. */
async function isLastAdmin(env: Env, member: MemberRow): Promise<boolean> {
	if (member.role !== 'admin' || member.deactivatedAt !== null) return false;
	const others = await db(env)
		.select({ n: count() })
		.from(schema.members)
		.where(
			and(
				eq(schema.members.role, 'admin'),
				isNull(schema.members.deactivatedAt),
				ne(schema.members.id, member.id)
			)
		)
		.get();
	return others?.n === 0;
}

export async function changeRole(env: Env, member: MemberRow, role: Role): Promise<Outcome> {
	if (role !== 'admin' && (await isLastAdmin(env, member))) {
		return { ok: false, message: auth.profile.errors.lastAdmin };
	}
	await db(env).update(schema.members).set({ role }).where(eq(schema.members.id, member.id));
	return { ok: true };
}

/**
 * Deactivating also ends every session the member has and closes their realtime sockets,
 * so they are signed out at once.
 */
export async function setDeactivated(
	env: Env,
	member: MemberRow,
	deactivated: boolean,
	now = Date.now()
): Promise<Outcome> {
	const d = db(env);
	if (!deactivated) {
		await d
			.update(schema.members)
			.set({ deactivatedAt: null })
			.where(eq(schema.members.id, member.id));
		return { ok: true };
	}
	if (await isLastAdmin(env, member)) return { ok: false, message: auth.profile.errors.lastAdmin };
	await d.batch([
		d.update(schema.members).set({ deactivatedAt: now }).where(eq(schema.members.id, member.id)),
		d.delete(schema.sessions).where(eq(schema.sessions.userId, member.userId))
	]);
	await disconnectUser(env, member.userId);
	return { ok: true };
}

export async function updateProfile(
	env: Env,
	userId: string,
	changes: { name: string; avatarKey?: string; coverKey?: string }
): Promise<void> {
	await db(env).update(schema.users).set(changes).where(eq(schema.users.id, userId));
}
