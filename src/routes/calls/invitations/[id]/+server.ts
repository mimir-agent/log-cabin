import { error, json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { answerInvitation } from '#lib/server/calls/invitations.js';
import { callsEnabled } from '#lib/server/calls/sfu.js';
import { calls as strings } from '#lib/strings/calls.js';
import type { RequestHandler } from './$types';

// The invitee's answer to a ring, from whichever of their tabs they answer in.
export const POST: RequestHandler = async (event) => {
	const env = getEnv();
	if (!callsEnabled(env)) error(404, strings.errors.disabled);
	const who = requireMember(event);
	const { answer } = (await event.request.json()) as { answer: unknown };
	if (answer !== 'accept' && answer !== 'decline') {
		error(400, `Expected answer "accept" or "decline", got ${JSON.stringify(answer)}`);
	}
	return json(await answerInvitation(env, who, event.params.id, answer));
};
