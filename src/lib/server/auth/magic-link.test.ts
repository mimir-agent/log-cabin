import { describe, expect, it } from 'vitest';
import { fakeD1 } from '../testing/fake-d1';
import { createOrgAndAdmin } from '../setup';
import { consumeSignInToken, requestSignInLink, takeAttempt } from './magic-link';

const origin = 'https://campfire.test';
const minute = 60 * 1000;

async function orgWithAdmin() {
	const { DB, sqlite } = fakeD1();
	const env = { DB, EMAIL_TRANSPORT: 'log', EMAIL_FROM: 'Campfire <campfire@example.com>' } as Env;
	await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' });
	const mails = () =>
		sqlite.prepare('SELECT to_address, subject, text_body FROM dev_mail').all() as {
			to_address: string;
			subject: string;
			text_body: string;
		}[];
	return { env, sqlite, mails };
}

function request(email: string, ip = '203.0.113.1') {
	return { email, ip, origin, orgName: 'Acme' };
}

function tokenFromMail(body: string): string {
	const match = body.match(/\/login\/verify\?token=(\S+)/);
	if (!match)
		throw new Error(`expected a /login/verify?token= link in the mail body, got: ${body}`);
	return decodeURIComponent(match[1]);
}

describe('sign-in links', () => {
	it('emails a member a link that signs them in once', async () => {
		const { env, sqlite, mails } = await orgWithAdmin();
		const now = Date.now();

		expect(await requestSignInLink(env, request('ada@example.com'), now)).toEqual({ ok: true });
		const sent = mails();
		expect(sent, 'expected exactly one email to the member').toHaveLength(1);
		expect(sent[0].to_address).toBe('ada@example.com');
		expect(sent[0].text_body).toContain(`${origin}/login/verify?token=`);

		const token = tokenFromMail(sent[0].text_body);
		const stored = sqlite.prepare('SELECT token_hash FROM sign_in_tokens').all() as {
			token_hash: string;
		}[];
		expect(stored).toHaveLength(1);
		expect(stored[0].token_hash, 'the stored hash must not be the token itself').not.toBe(token);

		expect(await consumeSignInToken(env, token, now + minute)).toBe('ada@example.com');
		expect(
			await consumeSignInToken(env, token, now + 2 * minute),
			'a used link must not work again'
		).toBeNull();
	});

	it('refuses a link opened more than 15 minutes after it was sent', async () => {
		const { env, mails } = await orgWithAdmin();
		const now = Date.now();
		await requestSignInLink(env, request('ada@example.com'), now);
		const token = tokenFromMail(mails()[0].text_body);

		expect(await consumeSignInToken(env, token, now + 15 * minute + 1)).toBeNull();
	});

	it('tells a stranger the same thing as a member but sends them nothing', async () => {
		const { env, mails } = await orgWithAdmin();

		expect(await requestSignInLink(env, request('mallory@elsewhere.test'))).toEqual({ ok: true });
		expect(mails(), 'expected no email to someone who may not sign in').toEqual([]);
	});

	it('refuses the 6th request for one email within 15 minutes, while others still get through', async () => {
		const { env } = await orgWithAdmin();
		const now = Date.now();
		for (let i = 0; i < 5; i++) {
			expect(await requestSignInLink(env, request('ada@example.com'), now + i)).toEqual({
				ok: true
			});
		}

		expect(await requestSignInLink(env, request('ada@example.com'), now + 10)).toMatchObject({
			ok: false
		});
		expect(
			await requestSignInLink(env, request('bob@example.com', '198.51.100.7'), now + 11)
		).toEqual({ ok: true });
	});

	it('refuses the 21st request from one IP within 15 minutes', async () => {
		const { env } = await orgWithAdmin();
		const now = Date.now();
		for (let i = 0; i < 20; i++) {
			expect(await requestSignInLink(env, request(`person${i}@example.com`), now + i)).toEqual({
				ok: true
			});
		}

		expect(await requestSignInLink(env, request('person20@example.com'), now + 20)).toMatchObject({
			ok: false
		});
	});
});

describe('takeAttempt', () => {
	function attempts(sqlite: ReturnType<typeof fakeD1>['sqlite'], key: string): number {
		const row = sqlite
			.prepare('SELECT COUNT(*) AS n FROM sign_in_attempts WHERE key = ?')
			.get(key) as { n: number };
		return row.n;
	}

	it('refuses the 6th attempt on a key in the window, and allows one after it', async () => {
		const { env } = await orgWithAdmin();
		const now = Date.now();
		for (let i = 0; i < 5; i++) expect(await takeAttempt(env, 'k', 5, now + i)).toBe(true);

		expect(await takeAttempt(env, 'k', 5, now + 10)).toBe(false);
		expect(await takeAttempt(env, 'other', 5, now + 10), 'another key has its own limit').toBe(
			true
		);
		expect(await takeAttempt(env, 'k', 5, now + 15 * minute + 5)).toBe(true);
	});

	it('takes exactly 5 of 40 attempts made at once', async () => {
		const { env, sqlite } = await orgWithAdmin();
		const now = Date.now();

		const results = await Promise.all(
			Array.from({ length: 40 }, () => takeAttempt(env, 'burst', 5, now))
		);
		expect(results.filter(Boolean).length, 'attempts allowed').toBe(5);
		expect(attempts(sqlite, 'burst'), 'attempts recorded').toBe(5);
	});
});
