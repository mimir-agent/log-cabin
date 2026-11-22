import { getEnv } from '#lib/server/platform.js';
import { redirect } from '@sveltejs/kit';
import { clearSessionCookie, deleteSession, sessionCookie } from '#lib/server/auth/session.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(sessionCookie);
	if (token) await deleteSession(getEnv(), token);
	clearSessionCookie(cookies);
	redirect(303, '/login');
};
