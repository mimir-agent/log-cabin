import { error } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { loadCall } from '#lib/server/calls/calls.js';
import { transcriptLines } from '#lib/server/recordings/transcripts.js';
import { recordingOfCall } from '#lib/server/recordings/video.js';
import { transcriptFile } from '#lib/server/recordings/transcript-files.js';
import type { RequestHandler } from './$types';

/** The recording's transcript as a file, /transcript/srt, /vtt or /txt, for anyone who can see the call. */
export const GET: RequestHandler = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const call = await loadCall(env, who, event.params.id);
	const recording = await recordingOfCall(env, call.id, event.params.recordingId);
	const { format } = event.params;
	const file = transcriptFile(format);
	if (!file) error(404, `Expected a transcript format of srt, vtt or txt, got ${format}`);
	return new Response(file.write(await transcriptLines(env, recording.id)), {
		headers: {
			'content-type': `${file.mime}; charset=utf-8`,
			'content-disposition': `attachment; filename="transcript.${format}"`
		}
	});
};
