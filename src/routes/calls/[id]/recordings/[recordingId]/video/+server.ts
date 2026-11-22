import { error, json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { loadCall } from '#lib/server/calls/calls.js';
import {
	completeVideo,
	recordingOfCall,
	startVideo,
	uploadVideoPart,
	videoResponse
} from '#lib/server/recordings/video.js';
import type { RequestHandler } from './$types';

/** Plays the recording's video, for anyone who can see the call. */
export const GET: RequestHandler = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const call = await loadCall(env, who, event.params.id);
	return videoResponse(
		env,
		await recordingOfCall(env, call.id, event.params.recordingId),
		event.request
	);
};

/** The recording browser starts its upload, then completes it with the parts it sent. */
export const POST: RequestHandler = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const { id: callId, recordingId } = event.params;
	await loadCall(env, who, callId);
	const { op } = (await event.request.json()) as { op: 'start' | 'complete' };
	if (op === 'start') await startVideo(env, who, callId, recordingId);
	else if (op === 'complete') await completeVideo(env, who, callId, recordingId);
	else error(400, `Expected op start or complete, got ${op}`);
	return json({});
};

/** One part of the video, ?part=<n>, of at least 5 MiB unless it is the last. */
export const PUT: RequestHandler = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const { id: callId, recordingId } = event.params;
	await loadCall(env, who, callId);
	const partNumber = Number(event.url.searchParams.get('part'));
	await uploadVideoPart(
		env,
		who,
		callId,
		recordingId,
		partNumber,
		await event.request.arrayBuffer()
	);
	return json({});
};
