import { getEnv } from '#lib/server/platform.js';
import { error, redirect } from '@sveltejs/kit';
import { googleSignInOffered, startGoogleSignIn } from '#lib/server/auth/google.js';
import { core } from '#lib/strings/core.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const env = getEnv();
	if (!env.GOOGLE_CLIENT_ID || !(await googleSignInOffered(env))) error(404, core.errors.notFound);
	const googleUrl = await startGoogleSignIn(env.GOOGLE_CLIENT_ID, url.origin, cookies);
	redirect(303, googleUrl, { external: true });
};
