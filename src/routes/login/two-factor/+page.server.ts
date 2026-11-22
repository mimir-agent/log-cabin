import { getEnv } from '#lib/server/platform.js';
import { fail, redirect } from '@sveltejs/kit';
import { startSession } from '#lib/server/auth/finish.js';
import { challengeUser, takeSecondFactor, endChallenge } from '#lib/server/auth/two-factor.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	if (!(await challengeUser(getEnv(), cookies))) redirect(303, '/login?error=twoFactorExpired');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const env = getEnv();
		const userId = await challengeUser(env, cookies);
		if (!userId) redirect(303, '/login?error=twoFactorExpired');
		const code = String((await request.formData()).get('code') ?? '');
		const checked = await takeSecondFactor(env, userId, code, { recovery: true });
		if (!checked.ok) return fail(400, { message: checked.message });
		await endChallenge(env, cookies);
		return startSession(env, cookies, userId);
	}
};
