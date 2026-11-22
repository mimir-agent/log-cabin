import { getEnv } from '#lib/server/platform.js';
import { fail, redirect } from '@sveltejs/kit';
import { ipLimit, takeAttempt } from '#lib/server/auth/magic-link.js';
import { createSession, setSessionCookie } from '#lib/server/auth/session.js';
import {
	acceptInvite,
	findOpenInvite,
	requestInviteFromLink,
	starterProjectsOf
} from '#lib/server/invites.js';
import { waitingRequester } from '#lib/server/join-requests.js';
import { getMember, memberIdForEmail } from '#lib/server/members.js';
import { getOrg } from '#lib/server/org.js';
import { isEmail } from '#lib/server/setup.js';
import { auth } from '#lib/strings/auth.js';
import type { Actions, PageServerLoad } from './$types';

const { errors } = auth.accept;

export const load: PageServerLoad = async ({ params }) => {
	const env = getEnv();
	const invite = await findOpenInvite(env, params.token);
	const orgName = (await getOrg(env)).name;
	if (!invite) return { orgName, invite: null };
	const starters = (await starterProjectsOf(env, invite.id)).map((project) => project.name);
	return { orgName, invite: { email: invite.email, role: invite.role, starters } };
};

export const actions: Actions = {
	// An invite addressed to one email: opening it proves the address, so accepting signs in.
	accept: async ({ params, request, cookies }) => {
		const env = getEnv();
		const invite = await findOpenInvite(env, params.token);
		if (!invite?.email) return fail(410, { message: auth.accept.invalid });
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name) return fail(400, { message: errors.nameMissing });
		if (await memberIdForEmail(env, invite.email)) {
			return fail(409, { message: errors.alreadyMember });
		}
		const userId = await acceptInvite(
			env,
			{ ...invite, email: invite.email },
			name,
			await waitingRequester(env, invite.email)
		);
		if (!userId) return fail(410, { message: auth.accept.invalid });
		const session = await createSession(env, userId);
		setSessionCookie(cookies, session.token, session.expiresAt);
		redirect(303, '/');
	},
	// A shareable link: the visitor asks for an invite to their own email. Each request sends
	// an email, so requests share the sign-in links' per-IP limit.
	request: async ({ params, request, url, getClientAddress }) => {
		const env = getEnv();
		const link = await findOpenInvite(env, params.token);
		if (!link || link.email) return fail(410, { message: auth.accept.invalid });
		const email = String((await request.formData()).get('email') ?? '')
			.trim()
			.toLowerCase();
		if (!isEmail(email)) return fail(400, { message: errors.emailInvalid });
		if (!(await takeAttempt(env, `ip:${getClientAddress()}`, ipLimit))) {
			return fail(429, { message: auth.login.errors.rateLimited });
		}
		const inviter = await getMember(env, link.invitedBy);
		if (!inviter) throw new Error(`invite ${link.id}: inviting member ${link.invitedBy} not found`);
		const orgName = (await getOrg(env)).name;
		await requestInviteFromLink(env, link, {
			email,
			orgName,
			origin: url.origin,
			inviterName: inviter.name
		});
		return { requestedFor: email };
	}
};
