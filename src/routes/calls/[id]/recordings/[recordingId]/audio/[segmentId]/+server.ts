import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { db, schema } from '#lib/server/db/index.js';
import { loadCall } from '#lib/server/calls/calls.js';
import { recordingOfCall } from '#lib/server/recordings/video.js';
import { calls as strings } from '#lib/strings/calls.js';
import type { RequestHandler } from './$types';

/** One person's minute of audio, as WAV, for the call page to mix and play. */
export const GET: RequestHandler = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const call = await loadCall(env, who, event.params.id);
	const recording = await recordingOfCall(env, call.id, event.params.recordingId);
	const { callRecordingSegments: s } = schema;
	const segment = await db(env)
		.select()
		.from(s)
		.where(and(eq(s.id, event.params.segmentId), eq(s.recordingId, recording.id)))
		.get();
	if (!segment) error(404, strings.recording.errors.notFound);
	const object = await env.BUCKET.get(segment.r2Key);
	if (!object) throw new Error(`segment ${segment.id}: R2 has no ${segment.r2Key}`);
	return new Response(object.body, {
		headers: { 'content-type': 'audio/wav', 'cache-control': 'private, max-age=86400' }
	});
};
