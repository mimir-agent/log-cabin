import {
	and,
	desc,
	eq,
	exists,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db, schema } from '../db';
import type { Role } from '../db/schema';
import type { SignedIn } from '../auth/session';
import { readThreadNaming, threadNaming } from '../chat/threads';
import { visibleProjectIds } from '../posts/access';
import { calls as strings } from '../../strings/calls';
import { summaryPreview } from '../recordings/transcripts';
import { canSeeCall, canSeePlace, liveCall, liveSummary, placeColumn } from './calls';
import { placeLink, placeOf, type CallPlace } from './places';
import { roomPath } from './rooms';
import { callShare, isSharedWith } from './shares';
import { callsEnabled } from './sfu';

export const historyFilters = ['all', 'joined'] as const;
export type HistoryFilter = (typeof historyFilters)[number];

const pageSize = 30;

/** What a project or thread page shows about its calls; null when calls aren't set up. */
export async function placeCalls(env: Env, who: SignedIn, place: CallPlace) {
	if (!callsEnabled(env)) return null;
	const [recent, live] = await Promise.all([
		callHistory(env, who, { place, limit: 5 }),
		liveCallIn(env, place)
	]);
	return { live, recent: recent.calls };
}

/** The calls shared into the channel. */
function sharedInto(env: Env, projectId: string): SQL {
	const { calls, callShares } = schema;
	return inArray(
		calls.id,
		db(env)
			.select({ id: callShares.callId })
			.from(callShares)
			.where(eq(callShares.projectId, projectId))
	);
}

/** The live call a place shows: its own, or for a channel one shared into it. */
export async function liveCallIn(env: Env, place: CallPlace, now = Date.now()) {
	const own = await liveCall(env, place, now);
	if (own || place.kind !== 'project') return own;
	const { calls } = schema;
	const shared = await db(env)
		.select()
		.from(calls)
		.where(and(isNull(calls.endedAt), sharedInto(env, place.id)))
		.get();
	return shared ? liveSummary(env, shared, now) : null;
}

/** Where this person is shown the call: its channel when they can't see where it began. */
export async function placeSeenBy(
	env: Env,
	who: SignedIn,
	call: { id: string; place: CallPlace }
): Promise<CallPlace> {
	if (await canSeePlace(env, who.user.id, who.member, call.place)) return call.place;
	const share = await callShare(env, call.id);
	const shared = share && (await isSharedWith(env, who.user.id, who.member, call.id));
	return shared ? { kind: 'project', id: share.projectId } : call.place;
}

/**
 * A thread's calls for its timeline, as Campsite shows them among the messages: the one going
 * on, and those ended since `since` (the first message shown), or all of them for null.
 */
export async function threadCalls(
	env: Env,
	who: SignedIn,
	threadId: string,
	since: number | null,
	now = Date.now()
) {
	if (!callsEnabled(env)) return null;
	const place = { kind: 'thread', id: threadId } as const;
	const [ended, live] = await Promise.all([
		callHistory(env, who, { place, since, limit: 100 }),
		liveCall(env, place, now)
	]);
	return { live, ended: ended.calls };
}

/** The calls going on now that this person can join, newest first, each with who is in it. */
export async function liveCalls(env: Env, who: SignedIn, now = Date.now()) {
	const open = await db(env)
		.select()
		.from(schema.calls)
		.where(isNull(schema.calls.endedAt))
		.orderBy(desc(schema.calls.startedAt), desc(schema.calls.id));
	const live = await Promise.all(
		open.map(async (row) => {
			const place = placeOf(row);
			if (!(await canSeeCall(env, who.user.id, who.member, row))) return null;
			const call = await liveCall(env, place, now);
			return (
				call && {
					...call,
					place: await placeLink(env, who, await placeSeenBy(env, who, { id: row.id, place }))
				}
			);
		})
	);
	return live.filter((call) => call !== null);
}

/** Where the next page starts: the last call's start time and id. */
const cursorOf = (call: { startedAt: number; id: string }) => `${call.startedAt}.${call.id}`;

function afterCursor(cursor: string): SQL {
	const { calls } = schema;
	const [at, id] = cursor.split(/\.(.*)/s);
	const startedAt = Number(at);
	if (!Number.isInteger(startedAt) || !id) {
		throw new Error(`call history: expected a cursor "<startedAt>.<id>", got "${cursor}"`);
	}
	return or(
		lt(calls.startedAt, startedAt),
		and(eq(calls.startedAt, startedAt), lt(calls.id, id))
	) as SQL;
}

/** Whether this person took part in the call of the calls row in scope. */
function tookPartIn(env: Env, who: { user: { id: string } }): SQL {
	const { calls, callParticipants: p } = schema;
	return exists(
		db(env)
			.select({ id: p.id })
			.from(p)
			.where(and(eq(p.callId, calls.id), eq(p.userId, who.user.id)))
	);
}

/**
 * The ended-call half of the calls.ts rule (canSeeCall) as SQL over the calls table, so a
 * page or a search counts only calls this person may see: they were in it, it was in their
 * own room, in a project they can see, in a thread they belong to, or shared into a channel
 * they can see.
 */
export function visibleCalls(env: Env, who: { user: { id: string }; member: { role: Role } }): SQL {
	const { calls, projects, chatThreadMembers, callShares } = schema;
	const visibleProjects = db(env)
		.select({ id: projects.id })
		.from(projects)
		.where(visibleProjectIds(who));
	return or(
		tookPartIn(env, who),
		eq(calls.roomOwnerId, who.user.id),
		inArray(calls.projectId, visibleProjects),
		inArray(
			calls.id,
			db(env)
				.select({ id: callShares.callId })
				.from(callShares)
				.where(inArray(callShares.projectId, visibleProjects))
		),
		inArray(
			calls.threadId,
			db(env)
				.select({ id: chatThreadMembers.threadId })
				.from(chatThreadMembers)
				.where(eq(chatThreadMembers.userId, who.user.id))
		)
	) as SQL;
}

/** A call's own place, and for a channel also the calls shared into it. */
function inPlace(env: Env, place: CallPlace): SQL {
	const own = eq(placeColumn(place), place.id);
	return place.kind === 'project' ? (or(own, sharedInto(env, place.id)) as SQL) : own;
}

/** Everyone who joined each of these calls, members and guests, once each by name. */
export function callPeople(env: Env, callIds: string[]) {
	const { callParticipants: p, callGuestPasses: guests } = schema;
	return db(env)
		.selectDistinct({
			callId: p.callId,
			name: sql<string>`coalesce(${schema.users.name}, ${guests.name})`
		})
		.from(p)
		.leftJoin(schema.users, eq(schema.users.id, p.userId))
		.leftJoin(guests, eq(guests.id, p.guestPassId))
		.where(inArray(p.callId, callIds));
}

/** Ended calls someone joined, newest first, that this person can see (visibleCalls). */
export async function callHistory(
	env: Env,
	who: SignedIn,
	options: {
		place?: CallPlace;
		filter?: HistoryFilter;
		cursor?: string | null;
		limit?: number;
		/** Only calls started at or after this time. */
		since?: number | null;
	}
) {
	const { calls, callParticipants: p, projects } = schema;
	const { callRecordings: r, callTranscriptLines: l } = schema;
	const owner = alias(schema.users, 'owner');
	const me = who.user.id;
	const limit = options.limit ?? pageSize;
	const tookPart = tookPartIn(env, who);
	const visible = visibleCalls(env, who);
	const placeFilter = options.place && inPlace(env, options.place);
	const rows = await db(env)
		.select({
			id: calls.id,
			startedAt: calls.startedAt,
			endedAt: calls.endedAt,
			title: calls.title,
			summary: calls.summary,
			recorded:
				sql<boolean>`${exists(db(env).select({ id: r.id }).from(r).where(eq(r.callId, calls.id)))}`.mapWith(
					Boolean
				),
			processing: sql<boolean>`${exists(
				db(env)
					.select({ id: r.id })
					.from(r)
					.where(and(eq(r.callId, calls.id), inArray(r.status, ['recording', 'processing'])))
			)}`.mapWith(Boolean),
			transcribed: sql<boolean>`${exists(
				db(env)
					.select({ id: l.id })
					.from(l)
					.innerJoin(r, eq(r.id, l.recordingId))
					.where(eq(r.callId, calls.id))
			)}`.mapWith(Boolean),
			projectId: calls.projectId,
			projectName: projects.name,
			threadId: calls.threadId,
			// Null for a call in no thread.
			threadNaming: sql<string | null>`${threadNaming(calls.threadId, me)}`,
			roomOwnerId: calls.roomOwnerId,
			roomOwnerName: owner.name,
			roomOwnerUsername: owner.username
		})
		.from(calls)
		.leftJoin(projects, eq(projects.id, calls.projectId))
		.leftJoin(owner, eq(owner.id, calls.roomOwnerId))
		.where(
			and(
				isNotNull(calls.endedAt),
				exists(db(env).select({ id: p.id }).from(p).where(eq(p.callId, calls.id))),
				visible,
				options.filter === 'joined' ? tookPart : undefined,
				placeFilter,
				options.cursor ? afterCursor(options.cursor) : undefined,
				options.since == null ? undefined : gte(calls.startedAt, options.since)
			)
		)
		.orderBy(desc(calls.startedAt), desc(calls.id))
		.limit(limit + 1);
	const page = rows.slice(0, limit);
	const people = page.length
		? await callPeople(
				env,
				page.map((r) => r.id)
			)
		: [];
	return {
		calls: page.map((call) => ({
			id: call.id,
			startedAt: call.startedAt,
			durationMs: call.endedAt! - call.startedAt,
			title: call.title,
			preview: summaryPreview(call.summary),
			recorded: call.recorded,
			transcribed: call.transcribed,
			processing: call.processing,
			place: placeLinkOfRow(who, call),
			names: people.filter((person) => person.callId === call.id).map((person) => person.name)
		})),
		next: rows.length > limit ? cursorOf(page.at(-1)!) : null
	};
}

export type HistoryCall = Awaited<ReturnType<typeof callHistory>>['calls'][number];

/** A history row's place, from the names its query joined in; the same rule as `placeLink` in places.ts. */
function placeLinkOfRow(
	who: SignedIn,
	call: {
		projectId: string | null;
		projectName: string | null;
		threadId: string | null;
		threadNaming: string | null;
		roomOwnerId: string | null;
		roomOwnerName: string | null;
		roomOwnerUsername: string | null;
	}
) {
	if (call.projectId) {
		return {
			kind: 'project' as const,
			name: call.projectName!,
			href: `/projects/${call.projectId}`
		};
	}
	if (call.threadId) {
		return {
			kind: 'thread' as const,
			name: readThreadNaming(call.threadNaming!).name,
			href: `/chat/${call.threadId}`
		};
	}
	const s = strings.personalRoom;
	return {
		kind: 'room' as const,
		name: call.roomOwnerId === who.user.id ? s.yours : s.of(call.roomOwnerName!),
		href: roomPath({ username: call.roomOwnerUsername! })
	};
}
