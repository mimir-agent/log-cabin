import { getEnv } from '#lib/server/platform.js';
import { fail } from '@sveltejs/kit';
import { confirmEmailChange, sentEmailChange } from '#lib/server/auth/email-change.js';
import { getOrg } from '#lib/server/org.js';
import { auth } from '#lib/strings/auth.js';
import type { Actions, PageServerLoad } from './$types';

// Like the sign-in link, opening this link only shows a button, so a mail scanner that
// fetches it doesn't use it up. A link that is no longer live gets no button.
export const load: PageServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token') ?? '';
	return { token, newEmail: await sentEmailChange(getEnv(), token) };
};

export const actions: Actions = {
	default: async ({ request, url }) => {
		const env = getEnv();
		const token = String((await request.formData()).get('token') ?? '');
		const changed = await confirmEmailChange(env, token, url.origin, (await getOrg(env)).name);
		if (!changed.ok) return fail(400, { message: auth.emailChange.errors.linkInvalid });
		return { done: auth.emailChange.done(changed.email) };
	}
};
