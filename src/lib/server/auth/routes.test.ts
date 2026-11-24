import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { GET as startGoogle } from '../../../routes/auth/google/+server';
import { GET as googleCallback } from '../../../routes/auth/google/callback/+server';
import { POST as logout } from '../../../routes/logout/+server';
import { actions as inviteActions } from '../../../routes/invite/[token]/+page.server';
import { actions as verifyActions } from '../../../routes/login/verify/+page.server';
import { googleSignInOffered } from './google';
import { ipLimit, requestSignInLink } from './magic-link';
import { createSession, readSession, sessionCookie } from './session';
import { createInviteLink } from '../invites';
import { updateOrg } from '../org';
import { createOrgAndAdmin } from '../setup';
import { useTestEnv } from '../testing/env';
import { fakeD1 } from '../testing/fake-d1';

function mailEnv(vars: Partial<Env> = {}) {
	const { DB, sqlite } = fakeD1();
	const env = {
		DB,
		EMAIL_TRANSPORT: 'log',
		EMAIL_FROM: 'Log Cabin <campfire@example.com>',
		...vars
	} as Env;
	useTestEnv(env);
	return { env, sqlite };
}

const ada = { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' };

async function thrown(promise: unknown): Promise<unknown> {
	return Promise.resolve(promise).catch((e: unknown) => e);
}

describe('sign out', () => {
	it('deletes the session server-side, so the old cookie no longer signs in', async () => {
		const { env } = mailEnv();
		const userId = await createOrgAndAdmin(env, ada);
		const { token } = await createSession(env, userId);
		const cookies = { get: vi.fn(() => token), delete: vi.fn() };
		const e = await thrown(logout({ cookies } as unknown as Parameters<typeof logout>[0]));
		expect(isRedirect(e) && e.location).toBe('/login');
		expect(cookies.delete).toHaveBeenCalledWith(sessionCookie, expect.anything());
		expect(await readSession(env, token), 'the session row should be gone').toBeNull();
	});
});

describe('an invite link', () => {
	it('stops sending invite emails to new addresses after the IP limit', async () => {
		const { env, sqlite } = mailEnv();
		await createOrgAndAdmin(env, ada);
		const adminId = (sqlite.prepare('SELECT id FROM members').get() as { id: string }).id;
		const token = await createInviteLink(env, {
			role: 'member',
			invitedBy: adminId,
			days: 7,
			projectIds: []
		});
		const request = (email: string) => {
			const body = new FormData();
			body.set('email', email);
			const event = {
				params: { token },
				url: new URL(`https://campfire.test/invite/${token}`),
				request: new Request(`https://campfire.test/invite/${token}`, { method: 'POST', body }),
				getClientAddress: () => '203.0.113.9'
			};
			return inviteActions.request(event as unknown as Parameters<typeof inviteActions.request>[0]);
		};
		for (let i = 0; i < ipLimit; i++) await request(`person${i}@example.net`);
		const refused = (await request('one-more@example.net')) as { status?: number };
		expect(refused?.status, `request ${ipLimit + 1} from one IP should be refused`).toBe(429);
		const sent = sqlite.prepare('SELECT COUNT(*) AS n FROM dev_mail').get() as { n: number };
		expect(sent.n).toBe(ipLimit);
	});
});

describe('the emailed sign-in link', () => {
	function verify(token: string) {
		const body = new FormData();
		body.set('token', token);
		const cookies = { set: vi.fn() };
		const event = {
			request: new Request('https://campfire.test/login/verify', { method: 'POST', body }),
			url: new URL('https://campfire.test/login/verify'),
			cookies
		};
		const result = verifyActions.default(
			event as unknown as Parameters<typeof verifyActions.default>[0]
		);
		return { result: thrown(result), cookies };
	}

	it('signs in once; the same link a second time sends the visitor back to /login', async () => {
		const { env, sqlite } = mailEnv();
		await createOrgAndAdmin(env, ada);
		await requestSignInLink(env, {
			email: 'ada@example.com',
			ip: '203.0.113.7',
			origin: 'https://campfire.test',
			orgName: 'Acme'
		});
		const { text_body } = sqlite.prepare('SELECT text_body FROM dev_mail').get() as {
			text_body: string;
		};
		const token = decodeURIComponent(text_body.match(/token=(\S+)/)?.[1] ?? '');

		const first = verify(token);
		const signedIn = await first.result;
		expect(isRedirect(signedIn) && signedIn.location).toBe('/');
		const [name, session] = first.cookies.set.mock.calls[0];
		expect(name).toBe(sessionCookie);
		expect((await readSession(env, session))?.user.email).toBe('ada@example.com');

		const second = verify(token);
		const refused = await second.result;
		expect(isRedirect(refused) && refused.location).toBe('/login?error=linkInvalid');
		expect(second.cookies.set).not.toHaveBeenCalled();
	});
});

describe('Google sign-in', () => {
	it('is offered only when both credentials are set and the org has it switched on', async () => {
		const unconfigured = mailEnv();
		await createOrgAndAdmin(unconfigured.env, ada);
		expect(await googleSignInOffered(unconfigured.env)).toBe(false);

		const { env } = mailEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
		await createOrgAndAdmin(env, ada);
		expect(await googleSignInOffered(env)).toBe(true);
		await updateOrg(env, { googleSignIn: false });
		expect(await googleSignInOffered(env)).toBe(false);

		const idOnly = mailEnv({ GOOGLE_CLIENT_ID: 'id' });
		await createOrgAndAdmin(idOnly.env, ada);
		expect(await googleSignInOffered(idOnly.env)).toBe(false);
	});

	// A cookie jar shared by the start and callback requests, as a browser's would be.
	function jar() {
		const values = new Map<string, string>();
		return {
			get: (name: string) => values.get(name),
			set: (name: string, value: string) => void values.set(name, value),
			delete: (name: string) => void values.delete(name),
			values
		};
	}

	function idToken(claims: object): string {
		const encode = (part: object) => btoa(JSON.stringify(part)).replaceAll('=', '');
		return `${encode({ alg: 'RS256' })}.${encode(claims)}.signature`;
	}

	it('sends the browser to Google with state and PKCE, then signs in a member on the callback', async () => {
		const { env } = mailEnv({ GOOGLE_CLIENT_ID: 'client-1', GOOGLE_CLIENT_SECRET: 'secret' });
		await createOrgAndAdmin(env, ada);
		const cookies = jar();
		const start = await thrown(
			startGoogle({
				url: new URL('https://campfire.test/auth/google'),
				cookies
			} as unknown as Parameters<typeof startGoogle>[0])
		);
		if (!isRedirect(start)) throw new Error(`expected a redirect to Google, got ${String(start)}`);
		const google = new URL(start.location);
		expect(google.origin).toBe('https://accounts.google.com');
		expect(google.searchParams.get('code_challenge_method')).toBe('S256');
		const state = google.searchParams.get('state') ?? '';

		const exchange = vi.fn(async (_url: string, init: RequestInit) => {
			const body = init.body as URLSearchParams;
			expect(body.get('code_verifier'), 'the token request carries the PKCE verifier').toBeTruthy();
			const claims = {
				iss: 'https://accounts.google.com',
				aud: 'client-1',
				exp: Date.now() / 1000 + 60,
				email: 'Ada@Example.com',
				email_verified: true
			};
			return Response.json({ id_token: idToken(claims) });
		});
		vi.stubGlobal('fetch', exchange);
		try {
			const callback = (query: string) =>
				thrown(
					googleCallback({
						url: new URL(`https://campfire.test/auth/google/callback?${query}`),
						cookies
					} as unknown as Parameters<typeof googleCallback>[0])
				);
			const signedIn = await callback(`code=abc&state=${state}`);
			expect(isRedirect(signedIn) && signedIn.location).toBe('/');
			expect((await readSession(env, cookies.values.get(sessionCookie)!))?.user.email).toBe(
				'ada@example.com'
			);

			const replayed = await callback(`code=abc&state=${state}`);
			expect(isRedirect(replayed) && replayed.location, 'state is single use').toBe(
				'/login?error=googleFailed'
			);
			expect(exchange).toHaveBeenCalledTimes(1);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
