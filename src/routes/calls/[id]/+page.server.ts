import { error } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { endCall, loadCall } from '#lib/server/calls/calls.js';
import { callPeople } from '#lib/server/calls/history.js';
import { callInvitations, invitablePeople, inviteToCall } from '#lib/server/calls/invitations.js';
import { placeLink } from '#lib/server/calls/places.js';
import { bookingOfCall } from '#lib/server/calcom/calcom.js';
import { callsEnabled } from '#lib/server/calls/sfu.js';
import { viewerFollowUps } from '#lib/server/follow-ups.js';
import { recordingsView } from '#lib/server/recordings/view.js';
import { deleteAllRecordings } from '#lib/server/recordings/remove.js';
import { pinState } from '#lib/server/posts/pins.js';
import { calls as strings } from '#lib/strings/calls.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

async function signedInWithCall(event: RequestEvent) {
	const env = getEnv();
	if (!callsEnabled(env)) error(404, strings.errors.disabled);
	const who = requireMember(event);
	return { env, who, call: await loadCall(env, who, event.params.id) };
}

export const load: PageServerLoad = async (event) => {
	event.depends('call:room');
	const { env, who, call } = await signedInWithCall(event);
	const live = call.endedAt === null;
	return {
		call: { id: call.id, ended: !live, participants: call.participants },
		// What a call that is over was: when, how long and who was in it. A live call lists its participants.
		past:
			call.endedAt === null
				? null
				: {
						startedAt: call.startedAt,
						durationMs: call.endedAt - call.startedAt,
						names: (await callPeople(env, [call.id])).map((person) => person.name)
					},
		place: { ...call.place, ...(await placeLink(env, who, call.place)) },
		booking: await bookingOfCall(env, call),
		canEnd: call.startedBy === who.user.id || who.member.role === 'admin',
		invitable: live ? await invitablePeople(env, who, call) : [],
		invitations: await callInvitations(env, call.id),
		followUps: await viewerFollowUps(env, who.user.id, [call.id]),
		recording: await recordingsView(env, who, call),
		pin: await pinState(env, who, call.place.kind === 'project' ? call.place.id : null, {
			type: 'call',
			id: call.id
		})
	};
};

export const actions: Actions = {
	end: async (event) => {
		const { env, who, call } = await signedInWithCall(event);
		await endCall(env, who, call);
	},
	invite: async (event) => {
		const { env, who, call } = await signedInWithCall(event);
		const form = await event.request.formData();
		const inviteeIds = form.getAll('invitee').map(String);
		if (inviteeIds.length === 0) error(400, strings.errors.cannotInvite);
		await inviteToCall(env, who, call, inviteeIds);
	},
	deleteRecordings: async (event) => {
		const { env, who, call } = await signedInWithCall(event);
		await deleteAllRecordings(env, who, call);
	}
};
