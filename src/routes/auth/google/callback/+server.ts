import { getEnv } from '#lib/server/platform.js';
import { error, redirect } from '@sveltejs/kit';
import { finishGoogleSignIn, googleSignInOffered } from '#lib/server/auth/google.js';
import { finishSignIn } from '#lib/server/auth/finish.js';
import { completeSignIn, signInFacts } from '#lib/server/auth/sign-in.js';
import { core } from '#lib/strings/core.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const env = getEnv();
	const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env;
	if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !(await googleSignInOffered(env))) {
		error(404, core.errors.notFound);
	}
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	// Without a code, the person cancelled at Google or Google refused the request.
	if (!code || !state) redirect(303, '/login?error=googleFailed');

	const identity = await finishGoogleSignIn(
		{ ...env, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET },
		{ code, state, origin: url.origin, cookies }
	);
	if (!identity) redirect(303, '/login?error=googleFailed');

	const facts = await signInFacts(env, identity.email, identity.emailVerified);
	const outcome = await completeSignIn(env, facts, identity.name, url.origin);
	if (outcome.kind === 'refused') redirect(303, `/login?error=${outcome.reason}`);
	if (outcome.kind === 'asked')
		redirect(303, `/login?asked=${outcome.pending ? 'pending' : 'sent'}`);
	return finishSignIn(env, cookies, outcome.userId);
};
