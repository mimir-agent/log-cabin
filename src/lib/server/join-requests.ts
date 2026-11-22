import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, schema } from './db';
import { sendEmail } from './email';
import { joinApprovedMail, joinDeniedMail, joinRequestMail } from './email/templates';
import { emit } from './events';
import { newId } from './id';
import { createMember } from './members';
import type { Handlers } from './notifications/handlers';
import { notify } from './notifications/notify';
import { getOrg } from './org';
import { availableUsername, suggestUsername } from './people/usernames';

// Someone signs in with a verified address at the org's email domain while the domain setting
// is "ask to join". They get a users row and no members row until an admin decides.

/** Where admins see and answer join requests. */
export const requestsPath = '/members?view=requests';

export type JoinRequest = {
	userId: string;
	name: string;
	email: string;
	avatarKey: string | null;
	createdAt: number;
};

/** Active admins, who decide on requests. */
function admins(env: Env) {
	const { members, users } = schema;
	return db(env)
		.select({ userId: users.id, email: users.email })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(and(eq(members.role, 'admin'), isNull(members.deactivatedAt)));
}

/** The users row of someone with this address who is waiting on a request, if anyone is. */
export async function waitingRequester(env: Env, email: string): Promise<string | null> {
	return (await requestRows(env).where(eq(schema.users.email, email)).get())?.userId ?? null;
}

/**
 * Records the request. The admins hear of it from the `join.requested` handler, so a failed
 * mail to them is retried by the queue and never fails the requester's sign-in.
 */
export async function askToJoin(
	env: Env,
	input: { email: string; name: string; origin: string },
	now = Date.now()
): Promise<void> {
	const d = db(env);
	const userId = newId(now);
	const username = await availableUsername(env, suggestUsername(input.name), now);
	await d.batch([
		d.insert(schema.users).values({
			id: userId,
			email: input.email,
			name: input.name,
			username,
			createdAt: now
		}),
		d.insert(schema.joinRequests).values({ userId, createdAt: now })
	]);
	await emit(env, { kind: 'join.requested', userId, origin: input.origin });
}

export const joinRequestHandlers: Handlers = {
	/** Puts the request in every admin's inbox and emails each of them. */
	async 'join.requested'(env, event) {
		const request = await pendingRequest(env, event.userId);
		// Answered before the queue got to it: there's nothing left to tell.
		if (!request) return;
		const recipients = await admins(env);
		await notify(
			env,
			recipients.map((admin) => admin.userId),
			{
				actorId: request.userId,
				kind: 'join_request',
				itemKey: `join:${request.userId}`,
				url: requestsPath,
				title: request.email,
				facts: null,
				source: `join.requested:${request.userId}`
			},
			event.emittedAt
		);
		const orgName = (await getOrg(env)).name;
		for (const admin of recipients) {
			await sendEmail(env, {
				to: admin.email,
				...joinRequestMail(request, orgName, `${event.origin}${requestsPath}`)
			});
		}
	}
};

export function listJoinRequests(env: Env): Promise<JoinRequest[]> {
	return requestRows(env).orderBy(desc(schema.joinRequests.createdAt));
}

function pendingRequest(env: Env, userId: string): Promise<JoinRequest | undefined> {
	return requestRows(env).where(eq(schema.joinRequests.userId, userId)).get();
}

function requestRows(env: Env) {
	const { joinRequests, users } = schema;
	return db(env)
		.select({
			userId: users.id,
			name: users.name,
			email: users.email,
			avatarKey: users.avatarKey,
			createdAt: joinRequests.createdAt
		})
		.from(joinRequests)
		.innerJoin(users, eq(users.id, joinRequests.userId))
		.$dynamic();
}

/**
 * Makes the person a member and emails them a link to sign in. Returns their name, or null when
 * the request was already answered.
 */
export async function approveJoinRequest(
	env: Env,
	userId: string,
	origin: string,
	now = Date.now()
): Promise<string | null> {
	const request = await pendingRequest(env, userId);
	if (!request) return null;
	await createMember(
		env,
		{ email: request.email, name: request.name, role: 'member', existingUserId: request.userId },
		now
	);
	const orgName = (await getOrg(env)).name;
	await sendEmail(env, { to: request.email, ...joinApprovedMail(orgName, `${origin}/login`) });
	return request.name;
}

/** Approves every waiting request, oldest first, and returns how many. */
export async function approveJoinRequests(
	env: Env,
	origin: string,
	now = Date.now()
): Promise<number> {
	const waiting = (await listJoinRequests(env)).reverse();
	for (const request of waiting) await approveJoinRequest(env, request.userId, origin, now);
	return waiting.length;
}

/**
 * Deletes the request and the person's users row, which takes the admins' notifications of it
 * too, and emails them the answer. Returns their name, or null when it was already answered.
 */
export async function denyJoinRequest(env: Env, userId: string): Promise<string | null> {
	const request = await pendingRequest(env, userId);
	if (!request) return null;
	await db(env).delete(schema.users).where(eq(schema.users.id, userId));
	const orgName = (await getOrg(env)).name;
	await sendEmail(env, { to: request.email, ...joinDeniedMail(orgName) });
	return request.name;
}
