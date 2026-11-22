import { getEnv } from '#lib/server/platform.js';
import { error, fail, redirect } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { roles } from '#lib/server/db/schema/index.js';
import { changeRole, getMemberByUserId, setDeactivated } from '#lib/server/members.js';
import { lookUpUsername } from '#lib/server/people/usernames.js';
import { clearStatus, setStatus } from '#lib/server/people/status.js';
import { personCard } from '#lib/server/people/summary.js';
import { people } from '#lib/strings/people.js';
import { roomPath } from '#lib/server/calls/rooms.js';
import { callsEnabled } from '#lib/server/calls/sfu.js';
import { canMessage } from '#lib/server/chat/threads.js';
import { auth } from '#lib/strings/auth.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** The member a /people/<username> URL names. A username changed in the last 30 days redirects. */
async function memberOrRedirect(env: Env, event: Pick<RequestEvent, 'params' | 'url'>) {
	const { username } = event.params;
	const found = await lookUpUsername(env, username);
	if (!found) error(404, auth.profile.errors.notFound);
	if ('redirectTo' in found) redirect(301, `/people/${found.redirectTo}${event.url.search}`);
	const member = await getMemberByUserId(env, found.userId);
	if (!member) throw new Error(`/people/${username}: user ${found.userId} has no member row`);
	return member;
}

export const load: PageServerLoad = async (event) => {
	const who = requireMember(event, 'viewer');
	const { member: viewer, user } = who;
	const env = getEnv();
	const member = await memberOrRedirect(env, event);
	return {
		person: personCard(member),
		isSelf: member.userId === user.id,
		member: {
			id: member.id,
			name: member.name,
			username: member.username,
			email: member.email,
			role: member.role,
			deactivatedAt: member.deactivatedAt,
			createdAt: member.createdAt
		},
		roomPath: callsEnabled(env) && member.deactivatedAt === null ? roomPath(member) : null,
		canManage: viewer.role === 'admin',
		canMessage: await canMessage(env, who, member.userId),
		roles: [...roles]
	};
};

/** Only you set your status: from your own profile, or a picker elsewhere that posts here. */
async function requireOwnProfile(event: RequestEvent): Promise<string> {
	const { user } = requireMember(event);
	const member = await memberOrRedirect(getEnv(), event);
	if (member.userId !== user.id) error(403, people.status.errors.notYours);
	return user.id;
}

export const actions: Actions = {
	status: async (event) => {
		const userId = await requireOwnProfile(event);
		const form = await event.request.formData();
		const field = (name: string) => String(form.get(name) ?? '');
		const outcome = await setStatus(getEnv(), userId, {
			emoji: field('emoji'),
			text: field('text'),
			expiry: field('expiry'),
			customAt: field('customAt')
		});
		if (!outcome.ok) return fail(400, { message: outcome.message });
	},
	clearStatus: async (event) => {
		const userId = await requireOwnProfile(event);
		await clearStatus(getEnv(), userId);
	},
	role: async (event) => {
		requireMember(event, 'admin');
		const env = getEnv();
		const member = await memberOrRedirect(env, event);
		const value = (await event.request.formData()).get('role');
		const role = roles.find((r) => r === value);
		if (!role) return fail(400, { message: auth.profile.errors.roleInvalid });
		const outcome = await changeRole(env, member, role);
		if (!outcome.ok) return fail(409, { message: outcome.message });
	},
	deactivate: async (event) => {
		requireMember(event, 'admin');
		const env = getEnv();
		const outcome = await setDeactivated(env, await memberOrRedirect(env, event), true);
		if (!outcome.ok) return fail(409, { message: outcome.message });
	},
	reactivate: async (event) => {
		requireMember(event, 'admin');
		const env = getEnv();
		await setDeactivated(env, await memberOrRedirect(env, event), false);
	}
};
