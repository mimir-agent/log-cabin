import { getEnv } from '#lib/server/platform.js';
import { fail, redirect } from '@sveltejs/kit';
import { finishSignIn } from '#lib/server/auth/finish.js';
import { passwordSignIn } from '#lib/server/auth/password.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, '/');
	return { resetDone: url.searchParams.get('reset') === 'done' };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const env = getEnv();
		const form = await request.formData();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const result = await passwordSignIn(env, {
			email,
			password: String(form.get('password') ?? '')
		});
		if (!result.ok) return fail(400, { email, message: result.message });
		return finishSignIn(env, cookies, result.userId);
	}
};
