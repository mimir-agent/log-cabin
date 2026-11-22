import { getEnv } from '#lib/server/platform.js';
import { fail, redirect } from '@sveltejs/kit';
import { minLength, newPasswordProblem } from '#lib/server/auth/password.js';
import { resetPassword } from '#lib/server/auth/password-reset.js';
import type { Actions, PageServerLoad } from './$types';

// Like the sign-in link, opening the reset link only shows a form, so a mail scanner that
// fetches it doesn't use it up.
export const load: PageServerLoad = ({ url }) => ({
	token: url.searchParams.get('token') ?? '',
	minLength
});

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const token = String(form.get('token') ?? '');
		const password = String(form.get('password') ?? '');
		const problem = await newPasswordProblem(password);
		if (problem) return fail(400, { message: problem });
		if (!(await resetPassword(getEnv(), token, password))) {
			redirect(303, '/login/forgot?error=linkInvalid');
		}
		redirect(303, '/login/password?reset=done');
	}
};
