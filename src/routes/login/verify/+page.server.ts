import { getEnv } from '#lib/server/platform.js';
import { fail, redirect } from '@sveltejs/kit';
import { finishSignIn } from '#lib/server/auth/finish.js';
import { consumeSignInToken } from '#lib/server/auth/magic-link.js';
import { completeSignIn, nameFromEmail, signInFacts } from '#lib/server/auth/sign-in.js';
import { getOrg } from '#lib/server/org.js';
import { auth } from '#lib/strings/auth.js';
import { invites } from '#lib/strings/invites.js';
import type { Actions, PageServerLoad } from './$types';

// Opening the link only shows a button; signing in is a POST. Mail scanners that fetch
// links would otherwise use up the single-use token before the person clicks it.
export const load: PageServerLoad = ({ url }) => ({ token: url.searchParams.get('token') ?? '' });

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const env = getEnv();
		const token = String((await request.formData()).get('token') ?? '');
		const email = token ? await consumeSignInToken(env, token) : null;
		if (!email) redirect(303, '/login?error=linkInvalid');
		const outcome = await completeSignIn(
			env,
			await signInFacts(env, email, true),
			nameFromEmail(email),
			url.origin
		);
		if (outcome.kind === 'refused') {
			return fail(403, { message: auth.login.errors[outcome.reason] });
		}
		if (outcome.kind === 'asked') {
			const orgName = (await getOrg(env)).name;
			const { login } = invites;
			return { asked: outcome.pending ? login.pending(orgName) : login.requested(orgName) };
		}
		return finishSignIn(env, cookies, outcome.userId);
	}
};
