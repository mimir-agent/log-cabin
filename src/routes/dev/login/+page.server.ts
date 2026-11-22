import { getEnv } from '#lib/server/platform.js';
import { error, fail, redirect } from '@sveltejs/kit';
import { createSession, setSessionCookie } from '#lib/server/auth/session.js';
import { roles } from '#lib/server/db/schema/index.js';
import { devLoginEnabled, upsertDevMember, validateDevLogin } from '#lib/server/dev-login.js';
import { core } from '#lib/strings/core.js';
import type { Actions, PageServerLoad } from './$types';

// import.meta.env.DEV is read per request (not at module load) so tests can stub it.
function requireDevLogin(env: Env): void {
	if (!devLoginEnabled(import.meta.env.DEV, env.DEV_LOGIN)) error(404, core.errors.notFound);
}

export const load: PageServerLoad = async () => {
	requireDevLogin(getEnv());
	return { roles: [...roles] };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const env = getEnv();
		requireDevLogin(env);
		const form = Object.fromEntries(await request.formData()) as Record<string, string>;
		const result = validateDevLogin(form);
		if (!result.ok)
			return fail(400, { message: result.message, email: form.email, name: form.name });
		const userId = await upsertDevMember(env, result.input);
		const { token, expiresAt } = await createSession(env, userId);
		setSessionCookie(cookies, token, expiresAt);
		redirect(303, '/');
	}
};
