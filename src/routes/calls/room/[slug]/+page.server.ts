import { error, redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { canSeePlace, liveCall, startCall } from '#lib/server/calls/calls.js';
import type { CallPlace } from '#lib/server/calls/places.js';
import { resolveRoomSlug, roomPath } from '#lib/server/calls/rooms.js';
import { callsEnabled } from '#lib/server/calls/sfu.js';
import { calls as strings } from '#lib/strings/calls.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

// A member's personal room: a permanent link anyone in the org but guests can open to start
// or join a call with them.
async function room(event: RequestEvent) {
	const env = getEnv();
	if (!callsEnabled(env)) error(404, strings.errors.disabled);
	const who = requireMember(event);
	const owner = await resolveRoomSlug(env, event.params.slug);
	if (!owner) error(404, strings.errors.roomNotFound);
	if ('redirectTo' in owner) redirect(301, roomPath({ username: owner.redirectTo }));
	const place: CallPlace = { kind: 'room', id: owner.userId };
	if (!(await canSeePlace(env, who.user.id, who.member, place))) {
		error(404, strings.errors.roomNotFound);
	}
	return { env, who, owner, place };
}

export const load: PageServerLoad = async (event) => {
	event.depends('calls:room');
	const { env, who, owner, place } = await room(event);
	return {
		owner: { userId: owner.userId, name: owner.name, isMe: owner.userId === who.user.id },
		live: await liveCall(env, place)
	};
};

export const actions: Actions = {
	join: async (event) => {
		const { env, who, place } = await room(event);
		redirect(303, `/calls/${await startCall(env, who, place)}`);
	}
};
