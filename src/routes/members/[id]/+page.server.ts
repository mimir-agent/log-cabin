import { error, redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { getMember } from '#lib/server/members.js';
import { auth } from '#lib/strings/auth.js';
import type { PageServerLoad } from './$types';

// Profiles live at /people/<username>. Links made before usernames, and search results,
// still name the member id.
export const load: PageServerLoad = async (event) => {
	requireMember(event, 'viewer');
	const member = await getMember(getEnv(), event.params.id);
	if (!member) error(404, auth.profile.errors.notFound);
	redirect(301, `/people/${member.username}`);
};
