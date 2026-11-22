import { error } from '@sveltejs/kit';
import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import { emit } from '../events';
import { newId } from '../id';
import type { Handlers } from '../notifications/handlers';
import { notify, pushTo, unreadCount, userTopic } from '../notifications/notify';
import { canSeeProject } from '../posts/access';
import { presentUserIds, publish } from '../realtime/publish';
import { calls as strings } from '../../strings/calls';
import type { LoadedCall } from './calls';
import { placeLink, placeOf } from './places';

// Asking someone into a live call. Their open tabs ring, and their devices get a push when
// no tab is open. An invitation starts 'ringing' and ends exactly once: 'accepted' or
// 'declined' by the invitee, 'missed' when nobody answers within ringSeconds, or
// 'cancelled' when the call ends first (calls.ts). Each change is published to the
// invitee's user:<id> topic, so every tab of theirs reloads its rings, and to the call's
// topic, so the caller sees the answer.

export const ringSeconds = 30;

type InvitationRow = typeof schema.callInvitations.$inferSelect;

/**
 * The people who may be asked into this call: active members who can see its place, other
 * than the person asking and whoever is in the call already.
 */
export async function invitablePeople(env: Env, who: SignedIn, call: LoadedCall) {
	const { members, users, projects, projectMembers, chatThreadMembers } = schema;
	const inCall = new Set(call.participants.map((p) => p.userId));
	const place = call.place;
	const people = await db(env)
		.select({ id: users.id, name: users.name, role: members.role })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(and(isNull(members.deactivatedAt), ne(users.id, who.user.id)))
		.orderBy(users.name);
	let canJoin: (person: (typeof people)[number]) => boolean;
	switch (place.kind) {
		case 'project': {
			const project = await db(env)
				.select({ private: projects.private, archivedAt: projects.archivedAt })
				.from(projects)
				.where(eq(projects.id, place.id))
				.get();
			const joined = await db(env)
				.select({ userId: projectMembers.userId })
				.from(projectMembers)
				.where(eq(projectMembers.projectId, place.id));
			const ids = new Set(joined.map((row) => row.userId));
			canJoin = (person) => canSeeProject(person, { ...project!, isMember: ids.has(person.id) });
			break;
		}
		case 'thread': {
			const inThread = await db(env)
				.select({ userId: chatThreadMembers.userId })
				.from(chatThreadMembers)
				.where(eq(chatThreadMembers.threadId, place.id));
			const ids = new Set(inThread.map((row) => row.userId));
			canJoin = (person) => ids.has(person.id);
			break;
		}
		case 'room':
			canJoin = (person) => person.id === place.id || person.role !== 'guest';
	}
	return people
		.filter((person) => !inCall.has(person.id) && canJoin(person))
		.map(({ id, name }) => ({ id, name }));
}

/** Rings each invitee: their open tabs, or their devices when they have no tab open. */
export async function inviteToCall(
	env: Env,
	who: SignedIn,
	call: LoadedCall,
	inviteeIds: string[],
	now = Date.now()
): Promise<void> {
	if (call.endedAt !== null) error(410, strings.errors.ended);
	if (!call.participants.some((p) => p.userId === who.user.id)) {
		error(403, strings.errors.notInCall);
	}
	const invitable = new Set((await invitablePeople(env, who, call)).map((p) => p.id));
	for (const id of inviteeIds) {
		if (!invitable.has(id)) error(400, strings.errors.cannotInvite);
	}
	for (const inviteeId of new Set(inviteeIds)) {
		// Someone already ringing for this call keeps ringing; nothing new is sent.
		const [invitation] = await db(env)
			.insert(schema.callInvitations)
			.values({
				id: newId(now),
				callId: call.id,
				inviterId: who.user.id,
				inviteeId,
				createdAt: now
			})
			.onConflictDoNothing()
			.returning();
		if (!invitation) continue;
		await publish(env, userTopic(inviteeId), { type: 'call.ring' });
		await emit(
			env,
			{ kind: 'call.ring.timeout', invitationId: invitation.id },
			{ delaySeconds: ringSeconds }
		);
		if ((await presentUserIds(env, userTopic(inviteeId))).length === 0) {
			await pushRing(env, who, call, invitation);
		}
	}
	await publish(env, `call:${call.id}`, { type: 'invitations' });
}

/**
 * The push for someone with no tab open. The invitation is stored and the in-app ring and
 * the missed call still reach them, so a push service's failure is logged, not thrown at
 * the person who invited them.
 */
async function pushRing(env: Env, who: SignedIn, call: LoadedCall, invitation: InvitationRow) {
	const invitee: SignedIn = await viewerOf(env, invitation.inviteeId);
	const place = await placeLink(env, invitee, call.place);
	const { sent, failures } = await pushTo(env, invitation.inviteeId, 'call', {
		title: strings.ringing.pushTitle(who.user.name),
		body: place.name,
		url: `/calls/${call.id}`,
		unread: await unreadCount(env, invitation.inviteeId)
	});
	console.log(
		`call ring: invitation ${invitation.id} pushed to ${sent} device(s) of user ${invitation.inviteeId}, no tab open`
	);
	if (failures.length) {
		console.error(`call ring: invitation ${invitation.id} push failed: ${failures.join('; ')}`);
	}
}

/**
 * Someone who isn't making this request, shaped as the viewer the place and thread helpers
 * take, so a push or a missed call names the place as they see it. No one is signed in.
 */
async function viewerOf(env: Env, userId: string): Promise<SignedIn> {
	const { members, users } = schema;
	const row = await db(env)
		.select({ user: users, member: members })
		.from(users)
		.innerJoin(members, eq(members.userId, users.id))
		.where(eq(users.id, userId))
		.get();
	if (!row) throw new Error(`calls: expected a member with user id ${userId}, found none`);
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

/** Moves a ringing invitation to its outcome; null when it had already stopped ringing. */
async function settleInvitation(
	env: Env,
	where: ReturnType<typeof and>,
	status: 'accepted' | 'declined' | 'missed',
	now: number
) {
	const { callInvitations: i } = schema;
	const [row] = await db(env)
		.update(i)
		.set({ status, answeredAt: now })
		.where(and(where, eq(i.status, 'ringing')))
		.returning();
	if (!row) return null;
	await publish(env, userTopic(row.inviteeId), { type: 'call.ring' });
	await publish(env, `call:${row.callId}`, { type: 'invitations' });
	return row;
}

/** The invitee's answer. Accepting returns the call to join. */
export async function answerInvitation(
	env: Env,
	who: SignedIn,
	invitationId: string,
	answer: 'accept' | 'decline',
	now = Date.now()
): Promise<{ callId: string }> {
	const { callInvitations: i } = schema;
	const row = await settleInvitation(
		env,
		and(eq(i.id, invitationId), eq(i.inviteeId, who.user.id)),
		answer === 'accept' ? 'accepted' : 'declined',
		now
	);
	if (!row) error(410, strings.errors.notRinging);
	return { callId: row.callId };
}

/** Joining the call any other way while it rings for you answers the ring. */
export async function acceptOnJoin(env: Env, userId: string, callId: string, now: number) {
	const { callInvitations: i } = schema;
	await settleInvitation(env, and(eq(i.callId, callId), eq(i.inviteeId, userId)), 'accepted', now);
}

/** A call that ends stops ringing for everyone it was ringing for. */
export async function cancelRinging(env: Env, callId: string, now: number) {
	const { callInvitations: i } = schema;
	const stopped = await db(env)
		.update(i)
		.set({ status: 'cancelled', answeredAt: now })
		.where(and(eq(i.callId, callId), eq(i.status, 'ringing')))
		.returning({ inviteeId: i.inviteeId });
	for (const { inviteeId } of stopped) {
		await publish(env, userTopic(inviteeId), { type: 'call.ring' });
	}
}

/** After ringSeconds: an unanswered invitation is missed, and lands in the invitee's inbox. */
export async function missInvitation(env: Env, invitationId: string, now = Date.now()) {
	const { callInvitations: i, calls } = schema;
	const row = await settleInvitation(env, eq(i.id, invitationId), 'missed', now);
	if (!row) return;
	const call = await db(env).select().from(calls).where(eq(calls.id, row.callId)).get();
	const place = await placeLink(env, await viewerOf(env, row.inviteeId), placeOf(call!));
	await notify(
		env,
		[row.inviteeId],
		{
			actorId: row.inviterId,
			kind: 'call',
			itemKey: `call:${row.callId}`,
			url: `/calls/${row.callId}`,
			title: place.name,
			facts: null,
			source: `call.missed:${row.id}`
		},
		now
	);
}

/** Who this call has rung, with each one's latest answer, for the people in the call. */
export async function callInvitations(env: Env, callId: string) {
	const { callInvitations: i, users } = schema;
	const rows = await db(env)
		.select({ inviteeId: i.inviteeId, name: users.name, status: i.status })
		.from(i)
		.innerJoin(users, eq(users.id, i.inviteeId))
		.where(eq(i.callId, callId))
		.orderBy(desc(i.createdAt), desc(sql`${i}.rowid`));
	const latest = new Map<string, (typeof rows)[number]>();
	for (const row of rows) if (!latest.has(row.inviteeId)) latest.set(row.inviteeId, row);
	return [...latest.values()];
}

/** The calls ringing for this person right now, for every tab of theirs to show. */
export async function ringingFor(env: Env, who: SignedIn, now = Date.now()) {
	const { callInvitations: i, calls, users } = schema;
	const rows = await db(env)
		.select({ id: i.id, callId: i.callId, from: users.name, call: calls })
		.from(i)
		.innerJoin(calls, eq(calls.id, i.callId))
		.innerJoin(users, eq(users.id, i.inviterId))
		.where(
			and(
				eq(i.inviteeId, who.user.id),
				eq(i.status, 'ringing'),
				gt(i.createdAt, now - ringSeconds * 1000),
				isNull(calls.endedAt)
			)
		)
		.orderBy(i.createdAt);
	const ringing = [];
	for (const row of rows) {
		const place = await placeLink(env, who, placeOf(row.call));
		ringing.push({ id: row.id, callId: row.callId, from: row.from, place: place.name });
	}
	return ringing;
}

/** Ends ringing that nobody answered: the queue sends call.ring.timeout ringSeconds after each ring. */
export const callHandlers: Handlers = {
	async 'call.ring.timeout'(env, event) {
		await missInvitation(env, event.invitationId);
	}
};
