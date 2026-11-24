import { isHttpError, isRedirect } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignedIn } from '../auth/session';
import { startCall } from '../calls/calls';
import { updateOrg } from '../org';
import { actions, load as bookingLoad } from '../../../routes/calls/booking/[id]/+page.server';
import { load as guestPageLoad } from '../../../routes/calls/[id]/guest/+page.server';
import { load as callPageLoad } from '../../../routes/calls/[id]/+page.server';
import { load as callsIndexLoad } from '../../../routes/calls/+page.server';
import { POST as sfuPost } from '../../../routes/calls/[id]/sfu/+server';
import {
	book,
	booking,
	calcomWorld,
	connect,
	origin,
	pageEvent,
	statusOrRedirect
} from './testing';

// The booking runs 17:00 to 17:30 on 11-20, so its guests may be in its call from 16:45 to 19:30.
const at = (time: string) => vi.setSystemTime(new Date(`2026-11-20T${time}Z`));

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	at('16:50:00');
});
afterEach(() => vi.useRealTimers());

/** Ada sends her bookings to the Bookings project; Bo, a member, is on this booking too. */
async function bookedWorld(options: { recording?: boolean } = {}) {
	const w = await calcomWorld(options);
	const bo = await w.person('Bo', 'member');
	const ada = await connect(w.admin, { place: w.projectId, apiKey: 'cal_live_ada' });
	const attendees = [
		...booking.attendees,
		{ name: 'Bo', email: 'BO@example.com', timeZone: 'UTC' }
	];
	const { id, url } = await book(ada, { ...booking, attendees });
	const signature = new URL(url).searchParams.get('guest')!;
	return { ...w, bo, bookingId: id, signature };
}

function lobby(bookingId: string, signature: string, who: SignedIn | null = null) {
	const path = `/calls/booking/${bookingId}?guest=${signature}`;
	return bookingLoad(pageEvent(who, path, { id: bookingId })) as Promise<{
		lobby: { state: string; guests: string[]; recorded: boolean };
	}>;
}

type SetCookie = { name: string; value: string; options: Record<string, unknown> };

/** Submits the lobby's form; answers where it went and the cookie it set, or the error status. */
type Joined = { status: number; location?: string; cookie?: SetCookie };

async function join(bookingId: string, signature: string, guest: number | null): Promise<Joined> {
	const form = new FormData();
	form.set('signature', signature);
	if (guest !== null) form.set('guest', String(guest));
	const set: SetCookie[] = [];
	const url = new URL(`${origin}/calls/booking/${bookingId}?/join`);
	try {
		await actions.join({
			request: new Request(url, { method: 'POST', body: form }),
			params: { id: bookingId },
			url,
			cookies: {
				set: (name: string, value: string, options: SetCookie['options']) =>
					set.push({ name, value, options })
			}
		} as never);
	} catch (e) {
		if (isRedirect(e)) return { location: e.location, cookie: set[0], status: e.status };
		if (isHttpError(e)) return { status: e.status };
		throw e;
	}
	throw new Error('join: expected a redirect to the guest page, got none');
}

async function joined(bookingId: string, signature: string, guest = 0) {
	const result = await join(bookingId, signature, guest);
	if (!result.cookie || !result.location)
		throw new Error(`joined: expected to get in, got ${result.status}`);
	const callId = result.location.split('/')[2];
	return { location: result.location, cookie: result.cookie, callId, token: result.cookie.value };
}

function guestPage(callId: string, token: string) {
	const cookies = { campfire_guest: token };
	return guestPageLoad(
		pageEvent(null, `/calls/${callId}/guest`, { id: callId }, cookies)
	) as Promise<{
		name: string;
		call: { id: string };
	}>;
}

type SfuAnswer = {
	participantId?: string;
	participants?: { name: string; userId: string | null }[];
};

/** The call's SFU route, as a browser holding only the guest cookie calls it. */
async function sfu(callId: string, token: string, body: object) {
	const url = new URL(`${origin}/calls/${callId}/sfu`);
	try {
		const response = await sfuPost({
			request: new Request(url, { method: 'POST', body: JSON.stringify(body) }),
			params: { id: callId },
			locals: { user: null, member: null },
			url,
			cookies: { get: (name: string) => (name === 'campfire_guest' ? token : undefined) }
		} as never);
		return { status: response.status, body: (await response.json()) as SfuAnswer };
	} catch (e) {
		if (isHttpError(e)) return { status: e.status, body: { ...e.body } as SfuAnswer };
		throw e;
	}
}

describe('joining a booking’s call as a guest', () => {
	it('lets an outside attendee join that call by name, in the place its owner chose', async () => {
		const w = await bookedWorld();

		const { lobby: open } = await lobby(w.bookingId, w.signature);
		expect(open.state).toBe('open');
		expect(open.guests, 'members on the booking sign in instead').toEqual([
			'Grace Hopper',
			'Alan Turing'
		]);

		const grace = await joined(w.bookingId, w.signature, 0);
		expect(grace.location).toBe(`/calls/${grace.callId}/guest`);
		expect(grace.cookie.name).toBe('campfire_guest');
		expect(grace.cookie.options).toMatchObject({
			path: `/calls/${grace.callId}`,
			httpOnly: true,
			secure: true,
			expires: new Date('2026-11-20T19:30:00Z')
		});
		const call = w.sqlite
			.prepare('SELECT project_id, started_by, calcom_booking_id FROM calls WHERE id = ?')
			.get(grace.callId);
		expect(call).toEqual({
			project_id: w.projectId,
			started_by: w.admin.user.id,
			calcom_booking_id: w.bookingId
		});

		expect((await guestPage(grace.callId, grace.token)).name).toBe('Grace Hopper');
		const answer = await sfu(grace.callId, grace.token, { op: 'join' });
		expect(answer.status).toBe(200);
		const people = await sfu(grace.callId, grace.token, {
			op: 'ping',
			participantId: answer.body.participantId
		});
		expect(people.body.participants).toEqual([
			expect.objectContaining({ name: 'Grace Hopper', userId: null })
		]);

		const alan = await joined(w.bookingId, w.signature, 1);
		expect(alan.callId, 'the second guest joins the same call').toBe(grace.callId);
	});

	it('is refused before 15 minutes ahead of the booking and after 2 hours past its end', async () => {
		const w = await bookedWorld();

		at('16:44:59');
		expect((await lobby(w.bookingId, w.signature)).lobby.state).toBe('early');
		expect(await join(w.bookingId, w.signature, 0)).toEqual({ status: 403 });

		at('16:45:00');
		const grace = await joined(w.bookingId, w.signature, 0);
		expect((await sfu(grace.callId, grace.token, { op: 'join' })).status).toBe(200);

		at('19:30:00');
		expect((await lobby(w.bookingId, w.signature)).lobby.state).toBe('over');
		expect(await join(w.bookingId, w.signature, 0)).toEqual({ status: 403 });
		expect((await sfu(grace.callId, grace.token, { op: 'join' })).status).toBe(404);
		expect(await statusOrRedirect(() => guestPage(grace.callId, grace.token))).toBe(404);
	});

	it('is refused with another booking’s signature or a made-up one', async () => {
		const w = await bookedWorld();
		const other = await book(
			{ ...(await connect(w.bo, { place: 'room', apiKey: 'cal_live_bo' })) },
			{ ...booking, uid: 'bk_other' }
		);

		expect(await statusOrRedirect(() => lobby(other.id, w.signature))).toBe(404);
		expect(await statusOrRedirect(() => lobby(w.bookingId, 'x'.repeat(43)))).toBe(404);
		expect(await join(other.id, w.signature, 0)).toEqual({ status: 404 });
		expect(await join(w.bookingId, w.signature, 2), 'Bo is no guest').toEqual({ status: 400 });
	});

	it('is refused when the guest chose no name', async () => {
		const w = await bookedWorld();

		expect(await join(w.bookingId, w.signature, null)).toEqual({ status: 400 });
	});

	it('lets the guest into that call’s page and SFU route, and nothing else', async () => {
		const w = await bookedWorld();
		const grace = await joined(w.bookingId, w.signature, 0);
		const otherCallId = await startCall(w.env, w.admin, { kind: 'room', id: w.admin.user.id });
		const withCookie = (path: string, params: Record<string, string>) =>
			pageEvent(null, path, params, { campfire_guest: grace.token });

		expect((await sfu(otherCallId, grace.token, { op: 'join' })).status).toBe(404);
		expect(await statusOrRedirect(() => guestPage(otherCallId, grace.token))).toBe(404);
		expect(
			await statusOrRedirect(() =>
				callPageLoad(withCookie(`/calls/${grace.callId}`, { id: grace.callId }))
			)
		).toBe(`/login?next=${encodeURIComponent(`/calls/${grace.callId}`)}`);
		expect(await statusOrRedirect(() => callsIndexLoad(withCookie('/calls', {})))).toBe(
			'/login?next=%2Fcalls'
		);
	});

	it('takes a signed-in member through to the call as themselves', async () => {
		const w = await bookedWorld();

		const opened = await statusOrRedirect(() => lobby(w.bookingId, w.signature, w.bo));

		expect(opened).toMatch(/^\/calls\/\w+$/);
	});
});

describe('the guest join screen and recording', () => {
	it('says nothing about recording while the org asks, until a recording is running', async () => {
		const w = await bookedWorld();

		expect((await lobby(w.bookingId, w.signature)).lobby.recorded).toBe(false);
	});

	it('says the call is recorded when the org records every call', async () => {
		const w = await bookedWorld({ recording: true });
		await updateOrg(w.env, { callRecording: 'on' });

		expect((await lobby(w.bookingId, w.signature)).lobby.recorded).toBe(true);
	});

	it('says nothing when recording is off', async () => {
		const w = await bookedWorld({ recording: true });
		await updateOrg(w.env, { callRecording: 'off' });

		expect((await lobby(w.bookingId, w.signature)).lobby.recorded).toBe(false);
	});
});
