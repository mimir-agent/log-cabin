import { error, json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { loadCall } from '#lib/server/calls/calls.js';
import { callsEnabled } from '#lib/server/calls/sfu.js';
import { startRecording, stopRecording } from '#lib/server/recordings/recordings.js';
import { calls as strings } from '#lib/strings/calls.js';
import type { RequestHandler } from './$types';

// Record and Stop on the call page. The answer names the recording, so the browser that
// started it can upload the video; nothing about the SFU's side reaches the browser.
export const POST: RequestHandler = async (event) => {
	const env = getEnv();
	if (!callsEnabled(env)) error(404, strings.errors.disabled);
	const who = requireMember(event);
	const call = await loadCall(env, who, event.params.id);
	const { op } = (await event.request.json()) as { op: 'start' | 'stop' };
	if (op === 'start') return json({ recordingId: await startRecording(env, who, call) });
	if (op === 'stop') {
		await stopRecording(env, who, call);
		return json({});
	}
	error(400, `Expected op start or stop, got ${op}`);
};
