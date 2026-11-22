import { getEnv } from '#lib/server/platform.js';
import { error, redirect } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { getMemberByUserId } from '#lib/server/members.js';
import { auth } from '#lib/strings/auth.js';
import type { RequestHandler } from './$types';

/** A person by user id, for places that only know the id (a byline, a comment): their profile. */
export const GET: RequestHandler = async (event) => {
	requireMember(event, 'viewer');
	const member = await getMemberByUserId(getEnv(), event.params.userId);
	if (!member) error(404, auth.profile.errors.notFound);
	redirect(303, `/people/${member.username}`);
};
