import { getEnv } from '#lib/server/platform.js';
import { error, json } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { getMemberByUserId } from '#lib/server/members.js';
import { personCard } from '#lib/server/people/summary.js';
import { canMessage } from '#lib/server/chat/threads.js';
import { auth } from '#lib/strings/auth.js';
import type { RequestHandler } from './$types';

/** What the hover card on a person's name shows, and whether it offers "Message". */
export const GET: RequestHandler = async (event) => {
	const who = requireMember(event, 'viewer');
	const env = getEnv();
	const member = await getMemberByUserId(env, event.params.userId);
	if (!member) error(404, auth.profile.errors.notFound);
	return json({ ...personCard(member), canMessage: await canMessage(env, who, member.userId) });
};
