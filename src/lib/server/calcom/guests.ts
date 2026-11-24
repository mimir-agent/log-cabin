// A Cal.com booking's outside attendees join its call as guests, without an account. The
// booking's link, which Cal.com shows everyone on the booking, is signed (bookingLink); with
// it, someone who isn't signed in picks their name from the booking's outside attendees and
// gets a guest pass for the booking's call (calls/guests.ts), valid from 15 minutes before
// the booking starts until 2 hours after it ends.
import { error } from '@sveltejs/kit';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import { startCall } from '../calls/calls';
import { createGuestPass } from '../calls/guests';
import { recordsEveryCall } from '../recordings/recordings';
import { calcom as strings } from '../../strings/calcom';
import {
	assertCalcomOn,
	bookingLinkSigned,
	bookingPlace,
	loadBooking,
	tagBookingCall
} from './calcom';

const minute = 60_000;

/** When a booking's guests may be in its call. */
export const guestWindow = (booking: { startsAt: number; endsAt: number }) => ({
	notBefore: booking.startsAt - 15 * minute,
	expiresAt: booking.endsAt + 120 * minute
});

/** The attendees who aren't members here, by name: the people who join as guests. */
async function outsideAttendees(env: Env, attendees: { name: string; email: string }[]) {
	const { users, members } = schema;
	const emails = attendees.map((a) => a.email.toLowerCase());
	const inside = await db(env)
		.select({ email: users.email })
		.from(users)
		.innerJoin(members, eq(members.userId, users.id))
		.where(and(inArray(sql`lower(${users.email})`, emails), isNull(members.deactivatedAt)));
	const memberEmails = new Set(inside.map((m) => m.email.toLowerCase()));
	return attendees.filter((a) => !memberEmails.has(a.email.toLowerCase())).map((a) => a.name);
}

export type GuestState = 'early' | 'open' | 'over' | 'cancelled';

async function openGuestLink(env: Env, bookingId: string, signature: string, now: number) {
	await assertCalcomOn(env);
	if (!(await bookingLinkSigned(env, bookingId, signature))) {
		error(404, strings.errors.bookingNotFound);
	}
	const booking = await loadBooking(env, bookingId);
	const window = guestWindow(booking);
	const state: GuestState =
		booking.cancelledAt !== null
			? 'cancelled'
			: now < window.notBefore
				? 'early'
				: now < window.expiresAt
					? 'open'
					: 'over';
	return { booking, window, state, guests: await outsideAttendees(env, booking.attendees) };
}

/** Whether the booking's call is being recorded now, or will be from its start. */
async function bookingRecorded(env: Env, bookingId: string): Promise<boolean> {
	if (await recordsEveryCall(env)) return true;
	const { calls, callRecordings: r } = schema;
	const live = await db(env)
		.select({ id: r.id })
		.from(r)
		.innerJoin(calls, eq(calls.id, r.callId))
		.where(
			and(eq(calls.calcomBookingId, bookingId), isNull(calls.endedAt), eq(r.status, 'recording'))
		)
		.get();
	return !!live;
}

/** What someone with the booking's link sees before joining as a guest. */
export async function guestLobby(env: Env, bookingId: string, signature: string, now = Date.now()) {
	const { booking, state, guests } = await openGuestLink(env, bookingId, signature, now);
	return {
		title: booking.title,
		startsAt: booking.startsAt,
		endsAt: booking.endsAt,
		state,
		guests,
		recorded: await bookingRecorded(env, bookingId)
	};
}

/** The booking's owner, who guests' calls are started for. */
async function ownerOf(env: Env, userId: string): Promise<SignedIn> {
	const { users, members } = schema;
	const row = await db(env)
		.select({ user: users, member: members })
		.from(users)
		.innerJoin(members, eq(members.userId, users.id))
		.where(eq(users.id, userId))
		.get();
	if (!row) throw new Error(`Cal.com guest join: booking owner ${userId} has no member row`);
	const { id, name, username, email, theme } = row.user;
	return {
		user: { id, name, username, email, avatarUrl: null, theme },
		member: { id: row.member.id, role: row.member.role }
	};
}

/**
 * Starts or joins the booking's call as the outside attendee at position `guest` of the
 * lobby's list, and issues their pass. The call happens where the booking's owner chose.
 */
export async function joinAsGuest(
	env: Env,
	input: { bookingId: string; signature: string; guest: number },
	now = Date.now()
): Promise<{ callId: string; token: string; expiresAt: number }> {
	const link = await openGuestLink(env, input.bookingId, input.signature, now);
	if (link.state !== 'open') error(403, strings.guest.closed[link.state]);
	const name = link.guests[input.guest];
	if (name === undefined) error(400, strings.errors.guestMissing);
	const { booking, window } = link;
	const owner = await ownerOf(env, booking.ownerId);
	const callId = await startCall(env, owner, await bookingPlace(env, booking), now);
	await tagBookingCall(env, callId, booking.id);
	const { token } = await createGuestPass(
		env,
		{ callId, name, ...window, createdBy: booking.ownerId },
		now
	);
	return { callId, token, expiresAt: window.expiresAt };
}
