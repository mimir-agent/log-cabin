import type { Cookies } from '@sveltejs/kit';
import { getOrg } from '../org';
import { randomToken } from './session';

// Google sign-in: OpenID Connect authorization code flow with state and PKCE. The ID token
// comes straight from Google's token endpoint over TLS, so its claims are read without
// checking the signature (Google's OIDC guide allows this for tokens fetched server-side).

const authorizeUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenUrl = 'https://oauth2.googleapis.com/token';
const issuers = ['https://accounts.google.com', 'accounts.google.com'];
const flowCookie = 'campfire_google';

export function googleConfigured(env: Env): boolean {
	return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** Google sign-in shows only when the deployment has credentials and the org has it on. */
export async function googleSignInOffered(env: Env): Promise<boolean> {
	return googleConfigured(env) && (await getOrg(env)).googleSignIn;
}

function callbackUrl(origin: string): string {
	return `${origin}/auth/google/callback`;
}

async function codeChallenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return btoa(String.fromCharCode(...new Uint8Array(digest)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');
}

/** The URL to send the browser to. State and the PKCE verifier wait in a short-lived cookie. */
export async function startGoogleSignIn(
	clientId: string,
	origin: string,
	cookies: Cookies
): Promise<string> {
	const state = randomToken();
	const verifier = randomToken();
	cookies.set(flowCookie, `${state}.${verifier}`, {
		path: '/auth/google',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 600
	});
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: callbackUrl(origin),
		response_type: 'code',
		scope: 'openid email profile',
		state,
		code_challenge: await codeChallenge(verifier),
		code_challenge_method: 'S256',
		prompt: 'select_account'
	});
	return `${authorizeUrl}?${params}`;
}

export type GoogleIdentity = { email: string; emailVerified: boolean; name: string };

/** Checks the claims Google's ID token must carry for this app, and reads the identity. */
export function identityFromClaims(
	claims: Record<string, unknown>,
	clientId: string,
	now = Date.now()
): GoogleIdentity {
	if (!issuers.includes(String(claims.iss))) {
		throw new Error(`Google ID token: expected iss accounts.google.com, got ${String(claims.iss)}`);
	}
	if (claims.aud !== clientId) {
		throw new Error('Google ID token: aud is not this deployment’s GOOGLE_CLIENT_ID');
	}
	if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) {
		throw new Error('Google ID token: expired or missing exp');
	}
	if (typeof claims.email !== 'string') throw new Error('Google ID token: no email claim');
	const email = claims.email.toLowerCase();
	return {
		email,
		emailVerified: claims.email_verified === true,
		name: typeof claims.name === 'string' && claims.name ? claims.name : email.split('@')[0]
	};
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
	const payload = jwt.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
	const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
	return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Finishes the flow on the callback: the returned state must match the cookie's, then the
 * code is exchanged with the PKCE verifier. Returns null when the state doesn't match.
 */
export async function finishGoogleSignIn(
	env: Env & { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string },
	input: { code: string; state: string; origin: string; cookies: Cookies }
): Promise<GoogleIdentity | null> {
	const [state, verifier] = (input.cookies.get(flowCookie) ?? '').split('.');
	input.cookies.delete(flowCookie, { path: '/auth/google' });
	if (!state || !verifier || state !== input.state) return null;

	const response = await fetch(tokenUrl, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code: input.code,
			client_id: env.GOOGLE_CLIENT_ID,
			client_secret: env.GOOGLE_CLIENT_SECRET,
			redirect_uri: callbackUrl(input.origin),
			grant_type: 'authorization_code',
			code_verifier: verifier
		})
	});
	if (!response.ok) {
		const detail = (await response.text()).slice(0, 300);
		throw new Error(`Google token exchange answered ${response.status}: ${detail}`);
	}
	const { id_token } = (await response.json()) as { id_token: string };
	return identityFromClaims(decodeJwtPayload(id_token), env.GOOGLE_CLIENT_ID);
}
