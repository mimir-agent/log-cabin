import { error, redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { openBookingCall } from '#lib/server/calcom/calcom.js';
import { guestLobby, joinAsGuest } from '#lib/server/calcom/guests.js';
import { guestCookiePath, guestPassCookie } from '#lib/server/calls/guests.js';
import { calcom } from '#lib/strings/calcom.js';
import type { Actions, PageServerLoad } from './$types';

// The link Cal.com puts on a booking. A member opening it starts or joins the booking's
// call. Someone who isn't signed in, holding the link's guest signature, gets the lobby,
// where an outside attendee picks their name and joins as a guest.
export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	const signature = event.url.searchParams.get('guest');
	if (!event.locals.user && signature !== null) {
		const lobby = await guestLobby(env, event.params.id, signature);
		return { title: lobby.title, lobby: { ...lobby, signature } };
	}
	const who = requireMember(event);
	const opened = await openBookingCall(env, who, event.params.id);
	if ('cancelled' in opened) return { title: opened.cancelled.title, lobby: null };
	redirect(303, `/calls/${opened.callId}`);
};

export const actions: Actions = {
	join: async (event) => {
		const form = await event.request.formData();
		const guest = form.get('guest');
		if (guest === null) error(400, calcom.errors.guestMissing);
		const joined = await joinAsGuest(getEnv(), {
			bookingId: event.params.id,
			signature: String(form.get('signature') ?? ''),
			guest: Number(guest)
		});
		event.cookies.set(guestPassCookie, joined.token, {
			path: guestCookiePath(joined.callId),
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			expires: new Date(joined.expiresAt)
		});
		redirect(303, `/calls/${joined.callId}/guest`);
	}
};
