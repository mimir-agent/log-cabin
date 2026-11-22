import { error, json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import {
	answerOffer,
	heartbeat,
	joinCall,
	leaveCall,
	loadCall,
	publishTracks,
	setMedia,
	subscribeTracks,
	unpublishTracks,
	type Caller
} from '#lib/server/calls/calls.js';
import { callsEnabled, type LocalTrack, type SessionDescription } from '#lib/server/calls/sfu.js';
import { calls as strings } from '#lib/strings/calls.js';
import { guestPassCookie, readGuestPass } from '#lib/server/calls/guests.js';
import type { RequestEvent, RequestHandler } from './$types';

// What the browser sends (src/lib/calls/connection.ts). Every op but join names the
// caller's participant row. A guest without an account is known by the guest pass cookie
// their join link set for this call's paths.
type SfuRequest = { participantId: string } & (
	| { op: 'join' }
	| { op: 'publish'; sessionDescription: SessionDescription; tracks: LocalTrack[] }
	| {
			op: 'unpublish';
			sessionDescription: SessionDescription;
			mids: string[];
			trackNames: string[];
	  }
	| { op: 'subscribe'; tracks: { sessionId: string; trackName: string }[] }
	| { op: 'answer'; sessionDescription: SessionDescription }
	| { op: 'media'; muted: boolean; cameraOff: boolean }
	| { op: 'ping' }
	| { op: 'leave' }
);

/**
 * A signed-in member, or else the guest whose pass is for this call and valid now (404
 * when it isn't), or else a redirect to sign in.
 */
async function callerOf(env: Env, event: RequestEvent): Promise<Caller> {
	const token = event.cookies.get(guestPassCookie);
	if (event.locals.user || token === undefined) return requireMember(event);
	const guest = await readGuestPass(env, token, event.params.id);
	if (!guest) error(404, strings.errors.callNotFound);
	return guest;
}

// The browser's only way to the SFU: each op acts on the caller's own session in this
// call, and calls.ts checks that it's theirs. Leaving also arrives here by sendBeacon.
export const POST: RequestHandler = async (event) => {
	const env = getEnv();
	if (!callsEnabled(env)) error(404, strings.errors.disabled);
	const body = (await event.request.json()) as SfuRequest;
	const who = await callerOf(env, event);
	const call = await loadCall(env, who, event.params.id);
	switch (body.op) {
		case 'join':
			return json(await joinCall(env, who, call));
		case 'publish':
			return json(await publishTracks(env, who, call, body.participantId, body));
		case 'unpublish':
			return json(await unpublishTracks(env, who, call, body.participantId, body));
		case 'subscribe':
			return json(await subscribeTracks(env, who, call, body.participantId, body.tracks));
		case 'answer':
			await answerOffer(env, who, call, body.participantId, body.sessionDescription);
			return json({});
		case 'media':
			await setMedia(env, who, call, body.participantId, {
				muted: !!body.muted,
				cameraOff: !!body.cameraOff
			});
			return json({});
		case 'ping':
			return json(await heartbeat(env, who, call, body.participantId));
		case 'leave':
			await leaveCall(env, who, call, body.participantId);
			return json({});
		default:
			error(
				400,
				`Expected op join, publish, unpublish, subscribe, answer, media, ping or leave; got ${(body as { op: unknown }).op}`
			);
	}
};
