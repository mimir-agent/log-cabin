import { redirect, type Cookies } from '@sveltejs/kit';
import { createSession, setSessionCookie } from './session';
import { createChallenge, twoFactorEnabled } from './two-factor';

/**
 * The last step of every sign-in method, once it knows who is signing in: a session, or,
 * when the user has two-factor on, the page that asks for their code.
 */
export async function finishSignIn(env: Env, cookies: Cookies, userId: string): Promise<never> {
	if (await twoFactorEnabled(env, userId)) {
		await createChallenge(env, cookies, userId);
		redirect(303, '/login/two-factor');
	}
	return startSession(env, cookies, userId);
}

export async function startSession(env: Env, cookies: Cookies, userId: string): Promise<never> {
	const session = await createSession(env, userId);
	setSessionCookie(cookies, session.token, session.expiresAt);
	redirect(303, '/');
}
