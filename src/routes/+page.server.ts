import { getEnv } from '#lib/server/platform.js';
import { redirect } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { listMembers } from '#lib/server/members.js';
import { onboardingOf } from '#lib/server/onboarding.js';
import { feed } from '#lib/server/posts/posts.js';
import { getObjectUrl } from '#lib/server/storage.js';
import { hasRole } from '#lib/roles.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const who = requireMember(event);
	const env = getEnv();
	// Home is where every sign-in lands, so it opens onboarding the first time.
	const [onboarding, members, posts] = await Promise.all([
		onboardingOf(env, who),
		hasRole(who.member.role, 'viewer')
			? listMembers(env, { query: '', includeDeactivated: false })
			: [],
		feed(env, who, { cursor: event.url.searchParams.get('cursor') })
	]);
	if (onboarding?.unstarted) redirect(303, '/onboarding');
	// The people rail beside the feed. Guests don't see the member list anywhere else either.
	const people = members.map((m) => ({
		id: m.id,
		name: m.name,
		role: m.role,
		avatarUrl: m.avatarKey ? getObjectUrl(m.avatarKey) : null
	}));
	return { ...posts, people, onboarding: onboarding !== null };
};
