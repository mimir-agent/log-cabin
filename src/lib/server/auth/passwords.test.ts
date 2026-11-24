import { createHash, createHmac } from 'node:crypto';
import { isRedirect } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as startGoogle } from '../../../routes/auth/google/+server';
import { GET as googleCallback } from '../../../routes/auth/google/callback/+server';
import { actions as forgotActions } from '../../../routes/login/forgot/+page.server';
import { actions as passwordActions } from '../../../routes/login/password/+page.server';
import { actions as resetActions } from '../../../routes/login/reset/+page.server';
import { actions as twoFactorActions } from '../../../routes/login/two-factor/+page.server';
import { actions as verifyActions } from '../../../routes/login/verify/+page.server';
import {
	actions as securityActions,
	load as securityLoad
} from '../../../routes/settings/security/+page.server';
import { emailLimit, requestSignInLink } from './magic-link';
import { readSession, sessionCookie } from './session';
import { createMember, getMember, setDeactivated } from '../members';
import { createOrgAndAdmin } from '../setup';
import { useTestEnv } from '../testing/env';
import { fakeD1 } from '../testing/fake-d1';

// Stories for passwords, password reset and two-factor sign-in, driven through the routes a
// browser would post to. Each "browser" is its own cookie jar, so a fresh one is a fresh
// context with no session.

const origin = 'https://campfire.test';
const goodPassword = 'correct horse battery';

function setup(vars: Partial<Env> = {}) {
	const { DB, sqlite } = fakeD1();
	const REALTIME = {
		idFromName: (name: string) => name,
		get: () => ({ fetch: async () => new Response(null, { status: 204 }) })
	};
	const env = {
		DB,
		REALTIME,
		EMAIL_TRANSPORT: 'log',
		EMAIL_FROM: 'Log Cabin <campfire@example.com>',
		...vars
	} as unknown as Env;
	useTestEnv(env);
	return { env, sqlite };
}

function browser() {
	const values = new Map<string, string>();
	return {
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => void values.set(name, value),
		delete: (name: string) => void values.delete(name),
		values
	};
}
type Browser = ReturnType<typeof browser>;

async function settle(promise: unknown): Promise<unknown> {
	return Promise.resolve(promise).catch((e: unknown) => e);
}

function location(result: unknown): string | undefined {
	return isRedirect(result) ? result.location : undefined;
}

function message(result: unknown): string | undefined {
	return (result as { data?: Record<string, string> })?.data?.message;
}

async function locals(env: Env, jar: Browser) {
	const token = jar.get(sessionCookie);
	const session = token ? await readSession(env, token) : null;
	return { user: session?.user ?? null, member: session?.member ?? null };
}

type Action = (event: never) => unknown;

async function post(env: Env, action: Action, path: string, fields: object, jar: Browser) {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.set(name, value);
	const event = {
		request: new Request(`${origin}${path}`, { method: 'POST', body }),
		url: new URL(`${origin}${path}`),
		cookies: jar,
		locals: await locals(env, jar),
		params: {},
		getClientAddress: () => '203.0.113.7'
	};
	return settle(action(event as never));
}

async function signedInAs(env: Env, jar: Browser): Promise<string | null> {
	return (await locals(env, jar)).user?.email ?? null;
}

/** Signs in with the emailed link, as an existing member would. */
async function signInByLink(env: Env, sqlite: Sqlite, email: string, jar = browser()) {
	await requestSignInLink(env, { email, ip: '203.0.113.7', origin, orgName: 'Acme' });
	const token = decodeURIComponent(lastMail(sqlite).match(/token=(\S+)/)?.[1] ?? '');
	const result = await post(env, verifyActions.default, '/login/verify', { token }, jar);
	return { jar, result };
}

type Sqlite = ReturnType<typeof fakeD1>['sqlite'];

function lastMail(sqlite: Sqlite): string {
	const row = sqlite.prepare('SELECT text_body FROM dev_mail ORDER BY rowid DESC LIMIT 1').get() as
		{ text_body: string } | undefined;
	if (!row) throw new Error('expected a message in the mail log, found none');
	return row.text_body;
}

function mailCount(sqlite: Sqlite): number {
	return (sqlite.prepare('SELECT COUNT(*) AS n FROM dev_mail').get() as { n: number }).n;
}

function signInWithPassword(env: Env, email: string, password: string, jar = browser()) {
	return post(env, passwordActions.default, '/login/password', { email, password }, jar);
}

// The breach list, as Have I Been Pwned's range API serves it: suffixes of SHA-1 hashes
// sharing the requested 5-character prefix, plus padding lines with a count of 0.
const breached = new Set(['password123', 'qwertyuiop']);
function pwnedApi(url: string | URL | Request): Response {
	const prefix = String(url).split('/range/')[1];
	const lines = [...breached]
		.map((p) => createHash('sha1').update(p).digest('hex').toUpperCase())
		.filter((hash) => hash.startsWith(prefix))
		.map((hash) => `${hash.slice(5)}:1234`);
	lines.push('0000000000000000000000000000000000A:0');
	return new Response(lines.join('\r\n'));
}

// An authenticator app: RFC 6238 with HMAC-SHA-1, written independently of the server's.
function base32ToBytes(secret: string): Buffer {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	const bits = [...secret].map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
	return Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
}
function authenticatorCode(secret: string, at = Date.now()): string {
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
	const mac = createHmac('sha1', base32ToBytes(secret)).update(counter).digest();
	const offset = mac[19] & 0xf;
	return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function setPasswordInSettings(env: Env, jar: Browser, password: string, current = '') {
	return post(env, securityActions.password, '/settings/security', { password, current }, jar);
}

/** Turns two-factor on from settings and returns the secret and recovery codes. */
async function turnOnTwoFactor(env: Env, jar: Browser) {
	await post(env, securityActions.startTwoFactor, '/settings/security', {}, jar);
	const page = (await securityLoad({
		locals: await locals(env, jar),
		url: new URL(`${origin}/settings/security`)
	} as never)) as { enrolment: { secret: string; qr: string } | null };
	if (!page.enrolment) throw new Error('settings should show a key to scan after setup starts');
	const { secret } = page.enrolment;
	const result = (await post(
		env,
		securityActions.confirmTwoFactor,
		'/settings/security',
		{ code: authenticatorCode(secret) },
		jar
	)) as { recoveryCodes?: string[] };
	if (!result.recoveryCodes) throw new Error(`turning on two-factor failed: ${message(result)}`);
	// The code just used can't be used again, so later sign-ins happen a step later.
	vi.setSystemTime(Date.now() + 30_000);
	return { secret, qr: page.enrolment.qr, codes: result.recoveryCodes };
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => pwnedApi(url))
	);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const ada = { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' };

describe('passwords', () => {
	it('a member sets a password in settings and signs in with it in a fresh browser; the emailed link still works', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');

		expect(await setPasswordInSettings(env, jar, goodPassword)).toEqual({ passwordSaved: true });

		const fresh = browser();
		const result = await signInWithPassword(env, 'ada@example.com', goodPassword, fresh);
		expect(location(result)).toBe('/');
		expect(await signedInAs(env, fresh)).toBe('ada@example.com');

		const byLink = await signInByLink(env, sqlite, 'ada@example.com');
		expect(location(byLink.result)).toBe('/');
		expect(await signedInAs(env, byLink.jar)).toBe('ada@example.com');
	});

	it('changing a password needs the current one, and then only the new one signs in', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');
		await setPasswordInSettings(env, jar, goodPassword);

		const refused = await setPasswordInSettings(
			env,
			jar,
			'a brand new password',
			'not my password'
		);
		expect((refused as { status: number }).status).toBe(400);

		await setPasswordInSettings(env, jar, 'a brand new password', goodPassword);
		expect(location(await signInWithPassword(env, 'ada@example.com', goodPassword))).toBe(
			undefined
		);
		expect(location(await signInWithPassword(env, 'ada@example.com', 'a brand new password'))).toBe(
			'/'
		);
	});

	it('refuses a password under 10 characters and one on the breach list, saying why', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');

		const short = (await setPasswordInSettings(env, jar, 'ninechars')) as {
			data: { passwordMessage: string };
		};
		expect(short.data.passwordMessage).toMatch(/10 characters/);

		const listed = (await setPasswordInSettings(env, jar, 'qwertyuiop')) as {
			data: { passwordMessage: string };
		};
		expect(listed.data.passwordMessage).toMatch(/breach/);
		expect(
			location(await signInWithPassword(env, 'ada@example.com', 'qwertyuiop')),
			'a refused password must not have been saved'
		).toBe(undefined);
	});

	it('accepts the password when the breach list can’t be reached', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');
		vi.stubGlobal('fetch', async () => {
			throw new TypeError('fetch failed');
		});
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		expect(await setPasswordInSettings(env, jar, 'qwertyuiop')).toEqual({ passwordSaved: true });
	});

	it('answers an unknown email exactly as it answers a wrong password', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');
		await setPasswordInSettings(env, jar, goodPassword);

		const wrong = await signInWithPassword(env, 'ada@example.com', 'not the password');
		const unknown = await signInWithPassword(env, 'nobody@example.com', 'not the password');
		expect(message(wrong)).toBeTruthy();
		expect(message(unknown)).toBe(message(wrong));
		expect((unknown as { status: number }).status).toBe((wrong as { status: number }).status);
	});

	it('after 5 failures in 15 minutes the 6th attempt gets the wait message, even with the right password', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');
		await setPasswordInSettings(env, jar, goodPassword);

		const failures: (string | undefined)[] = [];
		for (let i = 0; i < 5; i++) {
			failures.push(message(await signInWithPassword(env, 'ada@example.com', `wrong ${i}`)));
		}
		const sixth = await signInWithPassword(env, 'ada@example.com', goodPassword);
		expect(message(sixth)).toMatch(/Wait 15 minutes/);
		expect(failures, 'all 5 failures get the same message').toEqual(Array(5).fill(failures[0]));
		expect(message(sixth)).not.toBe(failures[0]);

		const unknownSixth: (string | undefined)[] = [];
		for (let i = 0; i < 6; i++) {
			unknownSixth.push(message(await signInWithPassword(env, 'nobody@example.com', 'x')));
		}
		expect(unknownSixth[5], 'unknown emails lock the same way').toBe(message(sixth));

		vi.setSystemTime(Date.now() + 15 * 60 * 1000 + 1);
		expect(location(await signInWithPassword(env, 'ada@example.com', goodPassword))).toBe('/');
	});

	it('checks only 5 of 40 wrong passwords sent at once', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');
		await setPasswordInSettings(env, jar, goodPassword);

		const results = await Promise.all(
			Array.from({ length: 40 }, (_, i) => signInWithPassword(env, 'ada@example.com', `wrong ${i}`))
		);
		const checked = results.filter((r) => !/Wait 15 minutes/.test(message(r) ?? ''));
		expect(checked.length, 'wrong passwords checked instead of refused for the limit').toBe(5);
	});

	it('checks only 5 of 40 wrong current passwords sent at once from settings', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');
		await setPasswordInSettings(env, jar, goodPassword);

		const results = await Promise.all(
			Array.from({ length: 40 }, (_, i) =>
				setPasswordInSettings(env, jar, 'a new long password', `wrong ${i}`)
			)
		);
		const checked = results.filter(
			(r) =>
				!/Wait 15 minutes/.test((r as { data: { passwordMessage: string } }).data.passwordMessage)
		);
		expect(checked.length, 'current passwords checked instead of refused for the limit').toBe(5);
	});
});

describe('password reset', () => {
	async function requestReset(env: Env, email: string) {
		return post(env, forgotActions.default, '/login/forgot', { email }, browser());
	}

	function resetToken(sqlite: Sqlite): string {
		return decodeURIComponent(lastMail(sqlite).match(/\/login\/reset\?token=(\S+)/)?.[1] ?? '');
	}

	function reset(env: Env, token: string, password: string) {
		return post(env, resetActions.default, '/login/reset', { token, password }, browser());
	}

	it('mails a link that sets a new password once, and signs the user out everywhere', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const laptop = (await signInByLink(env, sqlite, 'ada@example.com')).jar;
		const phone = (await signInByLink(env, sqlite, 'ada@example.com')).jar;

		expect(await requestReset(env, 'ada@example.com')).toEqual({
			email: 'ada@example.com',
			sent: true
		});
		const token = resetToken(sqlite);
		expect(token, 'the mail log should hold a reset link').not.toBe('');

		expect(location(await reset(env, token, goodPassword))).toBe('/login/password?reset=done');
		expect(await signedInAs(env, laptop), 'other sessions end').toBeNull();
		expect(await signedInAs(env, phone), 'other sessions end').toBeNull();
		expect(location(await signInWithPassword(env, 'ada@example.com', goodPassword))).toBe('/');

		expect(location(await reset(env, token, 'another good password'))).toBe(
			'/login/forgot?error=linkInvalid'
		);
		expect(location(await signInWithPassword(env, 'ada@example.com', goodPassword))).toBe('/');
	});

	it('refuses a link after 30 minutes', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		await requestReset(env, 'ada@example.com');
		vi.setSystemTime(Date.now() + 30 * 60 * 1000 + 1);

		expect(location(await reset(env, resetToken(sqlite), goodPassword))).toBe(
			'/login/forgot?error=linkInvalid'
		);
	});

	it('refuses a too-short or breached new password without using up the link', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		await requestReset(env, 'ada@example.com');
		const token = resetToken(sqlite);

		expect(message(await reset(env, token, 'short'))).toMatch(/10 characters/);
		expect(message(await reset(env, token, 'password123'))).toMatch(/breach/);
		expect(location(await reset(env, token, goodPassword))).toBe('/login/password?reset=done');
	});

	it(`mails only ${emailLimit} links for 40 reset requests sent at once`, async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const before = mailCount(sqlite);

		await Promise.all(Array.from({ length: 40 }, () => requestReset(env, 'ada@example.com')));
		expect(mailCount(sqlite) - before, 'reset emails sent').toBe(emailLimit);
	});

	it('gives the same answer for an unknown email and sends nothing', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const before = mailCount(sqlite);

		expect(await requestReset(env, 'nobody@example.com')).toEqual({
			email: 'nobody@example.com',
			sent: true
		});
		expect(mailCount(sqlite)).toBe(before);
	});
});

describe('a deactivated member', () => {
	it('is refused on the password, reset-request and reset-link paths', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { memberId } = await createMember(env, {
			email: 'bob@example.com',
			name: 'Bob',
			role: 'member'
		});
		const { jar } = await signInByLink(env, sqlite, 'bob@example.com');
		await setPasswordInSettings(env, jar, goodPassword);
		await post(
			env,
			forgotActions.default,
			'/login/forgot',
			{ email: 'bob@example.com' },
			browser()
		);
		const earlierLink = decodeURIComponent(lastMail(sqlite).match(/token=(\S+)/)?.[1] ?? '');

		await setDeactivated(env, (await getMember(env, memberId))!, true);

		const byPassword = browser();
		const refused = await signInWithPassword(env, 'bob@example.com', goodPassword, byPassword);
		expect(location(refused)).toBe(undefined);
		expect(message(refused)).toMatch(/deactivated/);
		expect(byPassword.get(sessionCookie)).toBeUndefined();

		const before = mailCount(sqlite);
		await post(
			env,
			forgotActions.default,
			'/login/forgot',
			{ email: 'bob@example.com' },
			browser()
		);
		expect(mailCount(sqlite), 'no reset mail for a deactivated member').toBe(before);

		const reset = await post(
			env,
			resetActions.default,
			'/login/reset',
			{ token: earlierLink, password: 'a brand new password' },
			browser()
		);
		expect(location(reset)).toBe('/login/forgot?error=linkInvalid');
	});

	it('is refused at the code page when deactivated after passing the first method', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { memberId } = await createMember(env, {
			email: 'bob@example.com',
			name: 'Bob',
			role: 'member'
		});
		const { jar } = await signInByLink(env, sqlite, 'bob@example.com');
		await setPasswordInSettings(env, jar, goodPassword);
		const { secret } = await turnOnTwoFactor(env, jar);

		const fresh = browser();
		const first = await signInWithPassword(env, 'bob@example.com', goodPassword, fresh);
		expect(location(first)).toBe('/login/two-factor');
		await setDeactivated(env, (await getMember(env, memberId))!, true);

		const code = { code: authenticatorCode(secret) };
		const result = await post(env, twoFactorActions.default, '/login/two-factor', code, fresh);
		expect(location(result)).toBe('/login?error=twoFactorExpired');
		expect(await signedInAs(env, fresh)).toBeNull();
	});
});

describe('two-factor authentication', () => {
	function answer(env: Env, jar: Browser, code: string) {
		return post(env, twoFactorActions.default, '/login/two-factor', { code }, jar);
	}

	it('is turned on with a code from the app scanned from a QR code or typed key, and shows 10 recovery codes once', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');

		const { qr, secret, codes } = await turnOnTwoFactor(env, jar);
		expect(qr).toMatch(/^data:image\/svg\+xml;base64,/);
		expect(secret).toMatch(/^[A-Z2-7]{32}$/);
		expect(codes).toHaveLength(10);
		expect(new Set(codes).size).toBe(10);
		for (const code of codes) expect(code).toHaveLength(20);

		const page = (await securityLoad({ locals: await locals(env, jar) } as never)) as object;
		expect(JSON.stringify(page), 'codes are not shown again').not.toContain(codes[0]);
		const stored = JSON.stringify(sqlite.prepare('SELECT * FROM recovery_codes').all());
		for (const code of codes) expect(stored, 'codes are stored hashed').not.toContain(code);
	});

	it('refuses a wrong code when turning it on', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');
		await post(env, securityActions.startTwoFactor, '/settings/security', {}, jar);

		const result = await post(
			env,
			securityActions.confirmTwoFactor,
			'/settings/security',
			{ code: '000000' },
			jar
		);
		expect((result as { status: number }).status).toBe(400);
		const page = (await securityLoad({ locals: await locals(env, jar) } as never)) as {
			twoFactor: { enabled: boolean };
		};
		expect(page.twoFactor.enabled).toBe(false);
	});

	it('asks for a code after a password sign-in, and signs in only with a right one', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');
		await setPasswordInSettings(env, jar, goodPassword);
		const { secret } = await turnOnTwoFactor(env, jar);

		const fresh = browser();
		const first = await signInWithPassword(env, 'ada@example.com', goodPassword, fresh);
		expect(location(first)).toBe('/login/two-factor');
		expect(await signedInAs(env, fresh), 'no session before the code').toBeNull();

		expect(message(await answer(env, fresh, '123456'))).toMatch(/isn’t right/);
		expect(await signedInAs(env, fresh)).toBeNull();

		const code = authenticatorCode(secret);
		expect(location(await answer(env, fresh, code))).toBe('/');
		expect(await signedInAs(env, fresh)).toBe('ada@example.com');

		const again = browser();
		await signInWithPassword(env, 'ada@example.com', goodPassword, again);
		expect(message(await answer(env, again, code)), 'a code works once').toMatch(/isn’t right/);
	});

	it('asks for a code after an emailed-link sign-in', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { secret } = await turnOnTwoFactor(
			env,
			(await signInByLink(env, sqlite, 'ada@example.com')).jar
		);

		const { jar, result } = await signInByLink(env, sqlite, 'ada@example.com');
		expect(location(result)).toBe('/login/two-factor');
		expect(await signedInAs(env, jar)).toBeNull();
		expect(location(await answer(env, jar, authenticatorCode(secret)))).toBe('/');
		expect(await signedInAs(env, jar)).toBe('ada@example.com');
	});

	it('asks for a code after a Google sign-in', async () => {
		const { env, sqlite } = setup({ GOOGLE_CLIENT_ID: 'client-1', GOOGLE_CLIENT_SECRET: 'secret' });
		await createOrgAndAdmin(env, ada);
		const { secret } = await turnOnTwoFactor(
			env,
			(await signInByLink(env, sqlite, 'ada@example.com')).jar
		);

		const jar = browser();
		const start = await settle(
			startGoogle({ url: new URL(`${origin}/auth/google`), cookies: jar } as never)
		);
		const state = new URL(location(start)!).searchParams.get('state');
		const encode = (part: object) => btoa(JSON.stringify(part)).replaceAll('=', '');
		const claims = {
			iss: 'https://accounts.google.com',
			aud: 'client-1',
			exp: Date.now() / 1000 + 60,
			email: 'ada@example.com',
			email_verified: true
		};
		vi.stubGlobal('fetch', async () =>
			Response.json({ id_token: `${encode({ alg: 'RS256' })}.${encode(claims)}.signature` })
		);
		const callback = await settle(
			googleCallback({
				url: new URL(`${origin}/auth/google/callback?code=abc&state=${state}`),
				cookies: jar
			} as never)
		);
		expect(location(callback)).toBe('/login/two-factor');
		expect(await signedInAs(env, jar)).toBeNull();
		expect(location(await answer(env, jar, authenticatorCode(secret)))).toBe('/');
		expect(await signedInAs(env, jar)).toBe('ada@example.com');
	});

	it('lets each recovery code stand in for the app once', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { codes } = await turnOnTwoFactor(
			env,
			(await signInByLink(env, sqlite, 'ada@example.com')).jar
		);

		const first = await signInByLink(env, sqlite, 'ada@example.com');
		expect(location(await answer(env, first.jar, codes[3]))).toBe('/');

		const second = await signInByLink(env, sqlite, 'ada@example.com');
		expect(message(await answer(env, second.jar, codes[3]))).toMatch(/isn’t right/);
		expect(location(await answer(env, second.jar, codes[4]))).toBe('/');
	});

	it('locks the code page after 5 wrong codes', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { secret } = await turnOnTwoFactor(
			env,
			(await signInByLink(env, sqlite, 'ada@example.com')).jar
		);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');
		for (let i = 0; i < 5; i++) await answer(env, jar, '000000');

		expect(message(await answer(env, jar, authenticatorCode(secret)))).toMatch(/Wait 15 minutes/);
		expect(await signedInAs(env, jar)).toBeNull();
	});

	it('checks only 5 of 40 wrong codes sent at once', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		await turnOnTwoFactor(env, (await signInByLink(env, sqlite, 'ada@example.com')).jar);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');

		const results = await Promise.all(
			Array.from({ length: 40 }, (_, i) => answer(env, jar, String(100000 + i)))
		);
		const checked = results.filter((r) => !/Wait 15 minutes/.test(message(r) ?? ''));
		expect(checked.length, 'codes checked instead of refused for the limit').toBe(5);
	});

	it('is turned off only with a current code, after which sign-in asks for none', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');
		const { secret } = await turnOnTwoFactor(env, jar);

		const refused = await post(
			env,
			securityActions.disableTwoFactor,
			'/settings/security',
			{ code: '000000' },
			jar
		);
		expect((refused as { status: number }).status).toBe(400);
		expect(location((await signInByLink(env, sqlite, 'ada@example.com')).result)).toBe(
			'/login/two-factor'
		);

		const off = await post(
			env,
			securityActions.disableTwoFactor,
			'/settings/security',
			{ code: authenticatorCode(secret) },
			jar
		);
		expect(off).toEqual({ twoFactorDisabled: true });
		expect(location((await signInByLink(env, sqlite, 'ada@example.com')).result)).toBe('/');
	});

	it('makes new recovery codes with a current code, and the old ones stop working', async () => {
		const { env, sqlite } = setup();
		await createOrgAndAdmin(env, ada);
		const { jar } = await signInByLink(env, sqlite, 'ada@example.com');
		const { secret, codes } = await turnOnTwoFactor(env, jar);

		const result = (await post(
			env,
			securityActions.regenerateCodes,
			'/settings/security',
			{ code: authenticatorCode(secret) },
			jar
		)) as { recoveryCodes: string[] };
		expect(result.recoveryCodes).toHaveLength(10);

		const attempt = await signInByLink(env, sqlite, 'ada@example.com');
		expect(message(await answer(env, attempt.jar, codes[0]))).toMatch(/isn’t right/);
		expect(location(await answer(env, attempt.jar, result.recoveryCodes[0]))).toBe('/');
	});
});
