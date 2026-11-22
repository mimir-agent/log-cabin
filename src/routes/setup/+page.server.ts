import { getEnv } from '#lib/server/platform.js';
import { fail, redirect } from '@sveltejs/kit';
import { requestSignInLink } from '#lib/server/auth/magic-link.js';
import { assertNoOrg, createOrgAndAdmin, validateSetupInput } from '#lib/server/setup.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const env = getEnv();
	await assertNoOrg(env);
	return { tokenRequired: Boolean(env.SETUP_TOKEN), token: url.searchParams.get('token') ?? '' };
};

export const actions: Actions = {
	default: async ({ request, url, getClientAddress }) => {
		const env = getEnv();
		await assertNoOrg(env);
		const form = Object.fromEntries(await request.formData()) as Record<string, string>;
		const result = validateSetupInput(form, env.SETUP_TOKEN);
		if (!result.ok) {
			return fail(result.status, {
				message: result.message,
				orgName: form.orgName,
				adminName: form.adminName,
				email: form.email
			});
		}
		await createOrgAndAdmin(env, result.input);
		// The admin proves the address by signing in from the emailed link. /setup is gone
		// from here on, so the confirmation shows on the sign-in page.
		await requestSignInLink(env, {
			email: result.input.email,
			ip: getClientAddress(),
			origin: url.origin,
			orgName: result.input.orgName
		});
		redirect(303, '/login?setup=done');
	}
};
