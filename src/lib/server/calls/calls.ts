import { error } from '@sveltejs/kit';
import { and, eq, inArray, isNotNull, isNull, lt, lte, notInArray, or, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { trackNames, type TrackName } from '../db/schema';
import { newId } from '../id';
import { emit } from '../events';
import { presentUserIds, publish } from '../realtime/publish';
import { canSeeProjectById } from '../posts/access';
import { isThreadMember } from '../chat/threads';
import type { SignedIn } from '../auth/session';
import { calls as strings } from '../../strings/calls';
import { acceptOnJoin, cancelRinging } from './invitations';
import { placeOf, type CallPlace } from './places';
import * as sfu from './sfu';
import { endRecording, syncRecording } from '../recordings/recordings';

type CallRow = typeof schema.calls.$inferSelect;
type ParticipantRow = typeof schema.callParticipants.$inferSelect;

/** Someone in a call without an account, on a guest pass for that one call (guests.ts). */
export type GuestCaller = { guest: { passId: string; callId: string; name: string } };
/** Whoever drives a participant: a signed-in member, or a guest on a pass. */
export type Caller = SignedIn | GuestCaller;
const isGuest = (caller: Caller): caller is GuestCaller => 'guest' in caller;
/** A guest's pass lets them send their camera and microphone, never their screen. */
const guestTrackNames: readonly TrackName[] = ['audio', 'video'];

/** How long a new participant may take to open the call's socket before counting as gone. */
const joinGraceMs = 20_000;
/** How long a call nobody has joined yet stays open for its starter. */
const emptyCallMs = 120_000;
/**
 * How long a guest's browser may go without a heartbeat before counting as gone. Its page
 * pings every 5 s, but a browser may slow a background tab's timers to once a minute.
 */
const guestSilenceMs = 90_000;

/** The calls column that holds a place of this kind. */
export function placeColumn(place: CallPlace) {
	const { calls } = schema;
	return { project: calls.projectId, thread: calls.threadId, room: calls.roomOwnerId }[place.kind];
}

const placeTopic = (place: CallPlace) => `${place.kind}:${place.id}`;

/**
 * Who can see a place and join its live calls: whoever can see the project, the people in
 * the thread, and for a personal room every member but guests, plus the room's owner.
 */
export async function canSeePlace(
	env: Env,
	userId: string,
	member: { role: SignedIn['member']['role'] },
	place: CallPlace
): Promise<boolean> {
	switch (place.kind) {
		case 'project':
			return canSeeProjectById(env, member, userId, place.id);
		case 'thread':
			return isThreadMember(env, place.id, userId);
		case 'room':
			return place.id === userId || member.role !== 'guest';
	}
}

/**
 * Who can see a call. A live one: whoever can see its place. An ended one is a record of
 * who talked: the people who were in it, and whoever can see its project or thread; a
 * personal room's past calls only its owner and the people who were in them.
 */
export async function canSeeCall(
	env: Env,
	userId: string,
	member: { role: SignedIn['member']['role'] },
	call: CallRow
): Promise<boolean> {
	const place = placeOf(call);
	if (call.endedAt === null) return canSeePlace(env, userId, member, place);
	if (place.kind === 'room' ? place.id === userId : await canSeePlace(env, userId, member, place)) {
		return true;
	}
	const { callParticipants: p } = schema;
	const took = await db(env)
		.select({ id: p.id })
		.from(p)
		.where(and(eq(p.callId, call.id), eq(p.userId, userId)))
		.get();
	return !!took;
}

async function assertCanSeePlace(env: Env, who: SignedIn, place: CallPlace) {
	if (!(await canSeePlace(env, who.user.id, who.member, place))) {
		error(404, strings.errors.callNotFound);
	}
}

/** Starts a call in the place, or returns the one already live there. */
export async function startCall(
	env: Env,
	who: SignedIn,
	place: CallPlace,
	now = Date.now()
): Promise<string> {
	if (!sfu.callsEnabled(env)) error(404, strings.errors.disabled);
	await assertCanSeePlace(env, who, place);
	const live = await liveCall(env, place, now);
	if (live) return live.id;
	const id = newId(now);
	await db(env)
		.insert(schema.calls)
		.values({
			id,
			projectId: place.kind === 'project' ? place.id : null,
			threadId: place.kind === 'thread' ? place.id : null,
			roomOwnerId: place.kind === 'room' ? place.id : null,
			startedBy: who.user.id,
			startedAt: now
		});
	await publish(env, placeTopic(place), { type: 'call' });
	return id;
}

/**
 * A call and who's in it now, 404ing for anyone who can't see it. A guest sees only the
 * call their pass is for.
 */
export async function loadCall(env: Env, caller: Caller, callId: string, now = Date.now()) {
	const call = await db(env).select().from(schema.calls).where(eq(schema.calls.id, callId)).get();
	const allowed =
		!!call &&
		(isGuest(caller)
			? caller.guest.callId === call.id
			: await canSeeCall(env, caller.user.id, caller.member, call));
	if (!call || !allowed) error(404, strings.errors.callNotFound);
	if (call.endedAt === null && !(await settle(env, call, now))) call.endedAt = now;
	return { ...call, place: placeOf(call), participants: await activeParticipants(env, callId) };
}

export type LoadedCall = Awaited<ReturnType<typeof loadCall>>;

function activeParticipants(env: Env, callId: string) {
	const { callParticipants: p, callGuestPasses: guests, users } = schema;
	return db(env)
		.select({
			id: p.id,
			userId: p.userId,
			name: sql<string>`coalesce(${users.name}, ${guests.name})`,
			sessionId: p.sessionId,
			tracks: p.tracks,
			muted: p.muted,
			cameraOff: p.cameraOff
		})
		.from(p)
		.leftJoin(users, eq(users.id, p.userId))
		.leftJoin(guests, eq(guests.id, p.guestPassId))
		.where(and(eq(p.callId, callId), isNull(p.leftAt)))
		.orderBy(p.joinedAt);
}

/** Opens an SFU session for this person and adds them to the call. */
export async function joinCall(env: Env, caller: Caller, call: LoadedCall, now = Date.now()) {
	if (call.endedAt !== null) error(410, strings.errors.ended);
	const sessionId = await sfu.newSession(env);
	const id = newId(now);
	const guest = isGuest(caller);
	await db(env)
		.insert(schema.callParticipants)
		.values({
			id,
			callId: call.id,
			userId: guest ? null : caller.user.id,
			guestPassId: guest ? caller.guest.passId : null,
			sessionId,
			joinedAt: now
		});
	if (!guest) await acceptOnJoin(env, caller.user.id, call.id, now);
	await announce(env, call);
	return { participantId: id, sessionId, iceServers: await sfu.iceServers(env) };
}

/** The caller's own place in a live call; their session is the only one they may drive. */
async function ownParticipant(
	env: Env,
	caller: Caller,
	call: LoadedCall,
	participantId: string
): Promise<ParticipantRow> {
	if (call.endedAt !== null) error(410, strings.errors.ended);
	const { callParticipants: p } = schema;
	const row = await db(env)
		.select()
		.from(p)
		.where(
			and(
				eq(p.id, participantId),
				eq(p.callId, call.id),
				isGuest(caller) ? eq(p.guestPassId, caller.guest.passId) : eq(p.userId, caller.user.id),
				isNull(p.leftAt)
			)
		)
		.get();
	if (!row) error(403, strings.errors.notInCall);
	return row;
}

function announce(env: Env, call: { id: string }) {
	return publish(env, `call:${call.id}`, { type: 'participants' });
}

/** Publishes the browser's local tracks with its offer; records the ones the SFU accepted. */
export async function publishTracks(
	env: Env,
	caller: Caller,
	call: LoadedCall,
	participantId: string,
	input: { sessionDescription: sfu.SessionDescription; tracks: sfu.LocalTrack[] }
): Promise<sfu.TracksResponse> {
	const me = await ownParticipant(env, caller, call, participantId);
	const allowed = isGuest(caller) ? guestTrackNames : trackNames;
	for (const track of input.tracks) {
		if (!allowed.includes(track.trackName as TrackName)) {
			error(400, strings.errors.unknownTrack);
		}
	}
	const response = await sfu.newTracks(env, me.sessionId, {
		sessionDescription: input.sessionDescription,
		tracks: input.tracks.map(({ mid, trackName }) => ({ location: 'local', mid, trackName }))
	});
	const accepted = (response.tracks ?? [])
		.filter((t) => !t.errorCode)
		.map((t) => t.trackName as TrackName);
	await setTracks(env, me, [...new Set([...me.tracks, ...accepted])]);
	// Someone joining a recorded call has their microphone recorded from here.
	await syncRecording(env, call.id);
	await announce(env, call);
	return response;
}

/** Stops publishing some tracks (a screen share ending), with the browser's new offer. */
export async function unpublishTracks(
	env: Env,
	caller: Caller,
	call: LoadedCall,
	participantId: string,
	input: { sessionDescription: sfu.SessionDescription; mids: string[]; trackNames: string[] }
): Promise<sfu.TracksResponse> {
	const me = await ownParticipant(env, caller, call, participantId);
	const response = await sfu.closeTracks(env, me.sessionId, {
		tracks: input.mids.map((mid) => ({ mid })),
		sessionDescription: input.sessionDescription,
		force: false
	});
	await setTracks(
		env,
		me,
		me.tracks.filter((name) => !input.trackNames.includes(name))
	);
	await announce(env, call);
	return response;
}

function setTracks(env: Env, me: ParticipantRow, tracks: TrackName[]) {
	const { callParticipants: p } = schema;
	return db(env).update(p).set({ tracks }).where(eq(p.id, me.id));
}

/** Subscribes this person's session to tracks other people in the same call publish. */
export async function subscribeTracks(
	env: Env,
	caller: Caller,
	call: LoadedCall,
	participantId: string,
	tracks: { sessionId: string; trackName: string }[]
): Promise<sfu.TracksResponse> {
	const me = await ownParticipant(env, caller, call, participantId);
	const others = await activeParticipants(env, call.id);
	for (const track of tracks) {
		const publisher = others.find((o) => o.sessionId === track.sessionId && o.id !== me.id);
		if (!publisher?.tracks.includes(track.trackName as TrackName)) {
			error(400, strings.errors.unknownTrack);
		}
	}
	return sfu.newTracks(env, me.sessionId, {
		tracks: tracks.map(({ sessionId, trackName }) => ({ location: 'remote', sessionId, trackName }))
	});
}

/** Passes the browser's answer to an offer the SFU made on its session. */
export async function answerOffer(
	env: Env,
	caller: Caller,
	call: LoadedCall,
	participantId: string,
	sessionDescription: sfu.SessionDescription
): Promise<void> {
	const me = await ownParticipant(env, caller, call, participantId);
	await sfu.renegotiate(env, me.sessionId, sessionDescription);
}

/** Records whether this person is muted or has their camera off, for everyone's tiles. */
export async function setMedia(
	env: Env,
	caller: Caller,
	call: LoadedCall,
	participantId: string,
	media: { muted: boolean; cameraOff: boolean }
): Promise<void> {
	const me = await ownParticipant(env, caller, call, participantId);
	const { callParticipants: p } = schema;
	await db(env).update(p).set(media).where(eq(p.id, me.id));
	await announce(env, call);
}

/**
 * A guest's browser saying it's still there, every few seconds, since guests have no
 * socket for the hub to see. Answers with who's in the call, which the guest's page has
 * no other way to hear about.
 */
export async function heartbeat(
	env: Env,
	caller: Caller,
	call: LoadedCall,
	participantId: string,
	now = Date.now()
) {
	const me = await ownParticipant(env, caller, call, participantId);
	const { callParticipants: p } = schema;
	await db(env).update(p).set({ seenAt: now }).where(eq(p.id, me.id));
	return { participants: call.participants };
}

/** Takes this person out of the call; the call ends when the last one leaves. */
export async function leaveCall(
	env: Env,
	caller: Caller,
	call: LoadedCall,
	participantId: string,
	now = Date.now()
): Promise<void> {
	const me = await ownParticipant(env, caller, call, participantId);
	const { callParticipants: p } = schema;
	await db(env).update(p).set({ leftAt: now }).where(eq(p.id, me.id));
	if (isGuest(caller)) await sfu.closeSession(env, me.sessionId);
	await endIfEmpty(env, call, now);
}

/** Ends the call for everyone. Only the person who started it and admins may. */
export async function endCall(env: Env, who: SignedIn, call: LoadedCall, now = Date.now()) {
	if (call.endedAt !== null) return;
	if (call.startedBy !== who.user.id && who.member.role !== 'admin') {
		error(403, strings.errors.cannotEnd);
	}
	await finish(env, call, now);
}

async function endIfEmpty(env: Env, call: CallRow, now: number) {
	const remaining = await activeParticipants(env, call.id);
	if (remaining.length === 0) await finish(env, call, now);
	else {
		await syncRecording(env, call.id, now);
		await announce(env, call);
	}
}

async function finish(env: Env, call: CallRow, now: number) {
	const { calls, callParticipants: p } = schema;
	await db(env)
		.update(p)
		.set({ leftAt: now })
		.where(and(eq(p.callId, call.id), isNull(p.leftAt)));
	await db(env).update(calls).set({ endedAt: now }).where(eq(calls.id, call.id));
	await cancelRinging(env, call.id, now);
	await endRecording(env, call.id, now);
	await emit(env, { kind: 'call.ended', callId: call.id });
	await publish(env, `call:${call.id}`, { type: 'ended' });
	await publish(env, placeTopic(placeOf(call)), { type: 'call' });
}

/**
 * Brings a live call up to date and says whether it's still live. Participants whose
 * browser closed without leaving (a crash, a lost network) are taken out: everyone in the
 * call has its topic open, so whoever the hub doesn't see on it, past the join grace, is
 * gone. Guests have no socket; their browser pings instead (heartbeat), and a guest not
 * heard from for guestSilenceMs is gone. A guest whose pass has run out is taken out too.
 * Every guest taken out has their SFU session closed, so their media stops even if their
 * browser keeps going.
 * A call with nobody left in it ends, unless it's new and its starter is still on the way in.
 */
async function settle(env: Env, call: CallRow, now: number): Promise<boolean> {
	const present = await presentUserIds(env, `call:${call.id}`);
	const { callParticipants: p, callGuestPasses: passes } = schema;
	const gone = await db(env)
		.update(p)
		.set({ leftAt: now })
		.where(
			and(
				eq(p.callId, call.id),
				isNull(p.leftAt),
				or(
					and(
						isNotNull(p.userId),
						notInArray(p.userId, present),
						lt(p.joinedAt, now - joinGraceMs)
					),
					and(
						isNotNull(p.guestPassId),
						lt(sql`coalesce(${p.seenAt}, ${p.joinedAt})`, now - guestSilenceMs)
					)
				)
			)
		)
		.returning({ sessionId: p.sessionId, guestPassId: p.guestPassId });
	const expired = await db(env)
		.update(p)
		.set({ leftAt: now })
		.where(
			and(
				eq(p.callId, call.id),
				isNull(p.leftAt),
				inArray(
					p.guestPassId,
					db(env)
						.select({ id: passes.id })
						.from(passes)
						.where(and(eq(passes.callId, call.id), lte(passes.expiresAt, now)))
				)
			)
		)
		.returning({ sessionId: p.sessionId });
	const silentGuests = gone.filter((g) => g.guestPassId !== null);
	for (const guest of [...silentGuests, ...expired]) await sfu.closeSession(env, guest.sessionId);
	const left = gone.length + expired.length;
	const empty = (await activeParticipants(env, call.id)).length === 0;
	if (empty && (left > 0 || call.startedAt < now - emptyCallMs)) {
		await finish(env, call, now);
		return false;
	}
	if (left > 0) {
		await syncRecording(env, call.id, now);
		await announce(env, call);
	}
	return true;
}

/**
 * Settles every live call that is being recorded. A call is settled only when someone loads
 * it, so when everyone's browser closes without leaving, nothing would end the call and its
 * recording would run on until the four-hour limit.
 */
export async function settleRecordedCalls(env: Env, now: number): Promise<void> {
	const { calls, callRecordings: r } = schema;
	const live = await db(env)
		.select({ call: calls })
		.from(calls)
		.innerJoin(r, eq(r.callId, calls.id))
		.where(and(isNull(calls.endedAt), eq(r.status, 'recording')));
	for (const { call } of live) await settle(env, call, now);
}

/** The live call in a place and who's in it, or null. */
export async function liveCall(env: Env, place: CallPlace, now = Date.now()) {
	const { calls } = schema;
	const call = await db(env)
		.select()
		.from(calls)
		.where(and(eq(placeColumn(place), place.id), isNull(calls.endedAt)))
		.get();
	if (!call || !(await settle(env, call, now))) return null;
	const people = await activeParticipants(env, call.id);
	return { id: call.id, startedAt: call.startedAt, names: [...new Set(people.map((p) => p.name))] };
}
