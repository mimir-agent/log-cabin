import { getEnv } from '#lib/server/platform.js';
import { fail, redirect } from '@sveltejs/kit';
import { requestPasswordReset } from '#lib/server/auth/password-reset.js';
import { getOrg } from '#lib/server/org.js';
import { isEmail } from '#lib/server/setup.js';
import { auth } from '#lib/strings/auth.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, '/');
	return { linkInvalid: url.searchParams.get('error') === 'linkInvalid' };
};

export const actions: Actions = {
	default: async ({ request, url, getClientAddress }) => {
		const env = getEnv();
		const email = String((await request.formData()).get('email') ?? '')
			.trim()
			.toLowerCase();
		if (!isEmail(email)) return fail(400, { email, message: auth.login.errors.emailInvalid });
		const result = await requestPasswordReset(env, {
			email,
			ip: getClientAddress(),
			origin: url.origin,
			orgName: (await getOrg(env)).name
		});
		if (!result.ok) return fail(429, { email, message: result.message });
		return { email, sent: true };
	}
};
