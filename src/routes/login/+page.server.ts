import { getEnv } from '#lib/server/platform.js';
import { fail, redirect } from '@sveltejs/kit';
import { googleSignInOffered } from '#lib/server/auth/google.js';
import { requestSignInLink } from '#lib/server/auth/magic-link.js';
import { getOrg } from '#lib/server/org.js';
import { isEmail } from '#lib/server/setup.js';
import { auth } from '#lib/strings/auth.js';
import { invites } from '#lib/strings/invites.js';
import type { Actions, PageServerLoad } from './$types';

function errorMessage(key: string | null): string | null {
	return key && Object.hasOwn(auth.login.errors, key)
		? auth.login.errors[key as keyof typeof auth.login.errors]
		: null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, '/');
	const env = getEnv();
	const asked = url.searchParams.get('asked');
	const orgName = asked ? (await getOrg(env)).name : '';
	return {
		google: await googleSignInOffered(env),
		error: errorMessage(url.searchParams.get('error')),
		setupDone: url.searchParams.get('setup') === 'done',
		asked:
			asked === 'sent'
				? invites.login.requested(orgName)
				: asked === 'pending'
					? invites.login.pending(orgName)
					: null
	};
};

export const actions: Actions = {
	default: async ({ request, url, getClientAddress }) => {
		const env = getEnv();
		const email = String((await request.formData()).get('email') ?? '')
			.trim()
			.toLowerCase();
		if (!isEmail(email)) return fail(400, { email, message: auth.login.errors.emailInvalid });
		const result = await requestSignInLink(env, {
			email,
			ip: getClientAddress(),
			origin: url.origin,
			orgName: (await getOrg(env)).name
		});
		if (!result.ok) return fail(429, { email, message: result.message });
		return { email, sent: true };
	}
};
