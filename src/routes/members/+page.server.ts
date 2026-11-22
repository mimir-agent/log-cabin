import { getEnv } from '#lib/server/platform.js';
import { fail } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import {
	approveJoinRequest,
	approveJoinRequests,
	denyJoinRequest,
	listJoinRequests
} from '#lib/server/join-requests.js';
import { listMembers } from '#lib/server/members.js';
import { personCard } from '#lib/server/people/summary.js';
import { getObjectUrl } from '#lib/server/storage.js';
import { invites } from '#lib/strings/invites.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { member } = requireMember(event, 'viewer');
	const env = getEnv();
	const query = event.url.searchParams.get('q')?.trim() ?? '';
	const isAdmin = member.role === 'admin';
	const members = await listMembers(env, { query, includeDeactivated: isAdmin });
	// Only admins answer join requests, so only they see the Requests view.
	const requests = isAdmin ? await listJoinRequests(env) : [];
	return {
		query,
		isAdmin,
		view:
			isAdmin && event.url.searchParams.get('view') === 'requests'
				? ('requests' as const)
				: ('members' as const),
		members: members.map((m) => ({
			...personCard(m),
			id: m.id,
			role: m.role,
			deactivatedAt: m.deactivatedAt
		})),
		requests: requests.map(({ avatarKey, ...request }) => ({
			...request,
			avatarUrl: avatarKey ? getObjectUrl(avatarKey) : null
		}))
	};
};

const { requests: s } = invites;

export const actions: Actions = {
	approve: async (event) => {
		requireMember(event, 'admin');
		const userId = String((await event.request.formData()).get('userId') ?? '');
		const name = await approveJoinRequest(getEnv(), userId, event.url.origin);
		if (!name) return fail(410, { message: s.gone });
		return { done: s.approved(name) };
	},
	approveAll: async (event) => {
		requireMember(event, 'admin');
		const count = await approveJoinRequests(getEnv(), event.url.origin);
		return { done: s.approvedAll(count) };
	},
	deny: async (event) => {
		requireMember(event, 'admin');
		const userId = String((await event.request.formData()).get('userId') ?? '');
		const name = await denyJoinRequest(getEnv(), userId);
		if (!name) return fail(410, { message: s.gone });
		return { done: s.denied(name) };
	}
};
