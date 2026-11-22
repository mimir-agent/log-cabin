import { error } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { loadCall } from '#lib/server/calls/calls.js';
import { guestPassCookie, readGuestPass } from '#lib/server/calls/guests.js';
import { callsEnabled } from '#lib/server/calls/sfu.js';
import { bookingOfCall } from '#lib/server/calcom/calcom.js';
import { calcom } from '#lib/strings/calcom.js';
import { calls } from '#lib/strings/calls.js';
import type { PageServerLoad } from './$types';

// A guest's view of the one call their pass is for: the call and nothing else. The pass
// comes in the cookie the booking's guest link set for this call's paths.
export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	if (!callsEnabled(env)) error(404, calls.errors.disabled);
	const token = event.cookies.get(guestPassCookie);
	const guest = token === undefined ? null : await readGuestPass(env, token, event.params.id);
	if (!guest) error(404, calcom.guest.linkInvalid);
	const call = await loadCall(env, guest, event.params.id);
	// Guest passes are issued only by a booking's link, which tags the call with a booking.
	const booking = (await bookingOfCall(env, call))!;
	return {
		call: { id: call.id, ended: call.endedAt !== null, participants: call.participants },
		name: guest.guest.name,
		title: booking.title
	};
};
