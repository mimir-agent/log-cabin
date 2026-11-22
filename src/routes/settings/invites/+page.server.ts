import { getEnv } from '#lib/server/platform.js';
import { fail } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { roles } from '#lib/server/db/schema/index.js';
import {
	checkStarterProjects,
	createInviteLink,
	inviteFromForm,
	inviteUrl,
	linkInviteDays,
	listOpenInvites,
	revokeInvite,
	starterProjectChoices
} from '#lib/server/invites.js';
import { auth } from '#lib/strings/auth.js';
import type { Actions, PageServerLoad } from './$types';

const { errors } = auth.invites;

export const load: PageServerLoad = async (event) => {
	const who = requireMember(event, 'admin');
	const env = getEnv();
	const invites = await listOpenInvites(env);
	return {
		invites: invites.map(({ id, email, role, expiresAt }) => ({ id, email, role, expiresAt })),
		roles: [...roles],
		linkInviteDays: [...linkInviteDays],
		starterProjects: await starterProjectChoices(env, who)
	};
};

export const actions: Actions = {
	email: async (event) => {
		const who = requireMember(event, 'admin');
		const form = await event.request.formData();
		const outcome = await inviteFromForm(getEnv(), who, form, event.url.origin);
		if (!outcome.ok) return fail(400, { message: outcome.message });
		return { sent: outcome.sent.length, notSent: outcome.notSent };
	},
	link: async (event) => {
		const who = requireMember(event, 'admin');
		const env = getEnv();
		const form = await event.request.formData();
		const role = roles.find((r) => r === form.get('role'));
		const days = linkInviteDays.find((d) => String(d) === form.get('days'));
		if (!role) return fail(400, { message: errors.roleInvalid });
		if (!days) return fail(400, { message: errors.expiryInvalid });
		const starters = await checkStarterProjects(env, who, form.getAll('project').map(String));
		if (!starters.ok) return fail(400, { message: starters.message });
		const token = await createInviteLink(env, {
			role,
			invitedBy: who.member.id,
			days,
			projectIds: starters.projectIds
		});
		return { link: inviteUrl(event.url.origin, token) };
	},
	revoke: async (event) => {
		requireMember(event, 'admin');
		const id = String((await event.request.formData()).get('id') ?? '');
		await revokeInvite(getEnv(), id);
	}
};
