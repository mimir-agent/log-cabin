import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from './index';
import { signInMail } from './templates';

// Enough of D1 for drizzle, over an in-memory SQLite with the real migration applied.
function fakeD1() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec(readFileSync('migrations/0001_core.sql', 'utf8'));
	const prepare = (sql: string) => ({
		bind: (...params: never[]) => ({
			run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...params), results: [] }),
			all: async () => ({ success: true, meta: {}, results: sqlite.prepare(sql).all(...params) }),
			raw: async () => {
				const statement = sqlite.prepare(sql);
				statement.setReturnArrays(true);
				return statement.all(...params);
			}
		})
	});
	return { sqlite, d1: { prepare } as unknown as D1Database };
}

const message = {
	to: 'ada@example.com',
	subject: 'Hello',
	text: 'Plain body',
	html: '<p>Body</p>'
};
const from = 'Campfire <campfire@example.com>';

function envWith(overrides: Record<string, unknown>): Env {
	return { EMAIL_FROM: from, ...overrides } as unknown as Env;
}

function stubFetch(response: Response) {
	const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => response);
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('sendEmail', () => {
	it('stores the message in dev_mail when EMAIL_TRANSPORT is log', async () => {
		const { sqlite, d1 } = fakeD1();
		await sendEmail(envWith({ EMAIL_TRANSPORT: 'log', DB: d1 }), message);

		expect(sqlite.prepare('SELECT * FROM dev_mail').all()).toEqual([
			expect.objectContaining({
				to_address: message.to,
				from_address: from,
				subject: message.subject,
				text_body: message.text,
				html_body: message.html
			})
		]);
	});

	it('posts the message to Resend with the API key when EMAIL_TRANSPORT is resend', async () => {
		const fetch = stubFetch(new Response('{}', { status: 200 }));
		await sendEmail(envWith({ EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_key' }), message);

		const [url, init] = fetch.mock.calls[0];
		expect(url).toBe('https://api.resend.com/emails');
		expect(init.method).toBe('POST');
		expect(init.headers).toMatchObject({ authorization: 'Bearer re_key' });
		expect(JSON.parse(init.body as string)).toEqual({
			from,
			to: [message.to],
			subject: message.subject,
			text: message.text,
			html: message.html
		});
	});

	it('sends both parts of a real email to Resend, and reports Resend’s rate limit', async () => {
		const mail = signInMail('Acme', 'https://campfire.test/login/verify?token=t1');
		const fetch = stubFetch(new Response('{"id":"4ef9a417"}', { status: 200 }));
		await sendEmail(envWith({ EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_key' }), {
			to: 'ada@example.com',
			...mail
		});
		const sent = JSON.parse(fetch.mock.calls[0][1].body as string);
		expect(sent.text).toContain('Sign in: https://campfire.test/login/verify?token=t1');
		expect(sent.html).toContain('href="https://campfire.test/login/verify?token=t1"');

		stubFetch(
			new Response(
				'{"statusCode":429,"name":"rate_limit_exceeded","message":"Too many requests. You can only make 2 requests per second."}',
				{ status: 429 }
			)
		);
		await expect(
			sendEmail(envWith({ EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_key' }), {
				to: 'ada@example.com',
				...mail
			})
		).rejects.toThrow(/api\.resend\.com\/emails answered 429: .*rate_limit_exceeded/);
	});

	it('posts the message to Postmark with the server token when EMAIL_TRANSPORT is postmark', async () => {
		const fetch = stubFetch(new Response('{}', { status: 200 }));
		await sendEmail(envWith({ EMAIL_TRANSPORT: 'postmark', POSTMARK_TOKEN: 'pm_token' }), message);

		const [url, init] = fetch.mock.calls[0];
		expect(url).toBe('https://api.postmarkapp.com/email');
		expect(init.headers).toMatchObject({ 'x-postmark-server-token': 'pm_token' });
		expect(JSON.parse(init.body as string)).toEqual({
			From: from,
			To: message.to,
			Subject: message.subject,
			TextBody: message.text,
			HtmlBody: message.html,
			MessageStream: 'outbound'
		});
	});

	it.each([
		['resend', { RESEND_API_KEY: 're_key' }],
		['postmark', { POSTMARK_TOKEN: 'pm_token' }]
	])('throws with the status and body when %s rejects the message', async (transport, secret) => {
		stubFetch(new Response('invalid from address', { status: 422 }));
		await expect(
			sendEmail(envWith({ EMAIL_TRANSPORT: transport, ...secret }), message)
		).rejects.toThrow(/422: invalid from address/);
	});

	it('truncates a long error body to 500 characters', async () => {
		stubFetch(new Response('x'.repeat(2000), { status: 500 }));
		const send = sendEmail(
			envWith({ EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_key' }),
			message
		);
		await expect(send).rejects.toThrow(new RegExp(`500: x{500}$`));
	});

	it.each([
		['resend', 'RESEND_API_KEY'],
		['postmark', 'POSTMARK_TOKEN']
	])('throws naming the missing secret when %s has no credentials', async (transport, secret) => {
		const fetch = stubFetch(new Response('{}'));
		await expect(sendEmail(envWith({ EMAIL_TRANSPORT: transport }), message)).rejects.toThrow(
			secret
		);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('sends through the EMAIL binding when EMAIL_TRANSPORT is cloudflare', async () => {
		const send = vi.fn(async () => ({ messageId: 'm1' }));
		await sendEmail(envWith({ EMAIL_TRANSPORT: 'cloudflare', EMAIL: { send } }), message);
		expect(send).toHaveBeenCalledWith({ from, ...message });
	});

	it('throws when EMAIL_TRANSPORT is cloudflare and the EMAIL binding is missing', async () => {
		await expect(sendEmail(envWith({ EMAIL_TRANSPORT: 'cloudflare' }), message)).rejects.toThrow(
			'EMAIL_TRANSPORT is cloudflare but the EMAIL send_email binding is not configured in wrangler.jsonc'
		);
	});

	describe('on the campfire-test Worker', () => {
		const test = { WORKER_NAME: 'campfire-test' };

		it('stores the message in dev_mail when EMAIL_TRANSPORT is log', async () => {
			const { sqlite, d1 } = fakeD1();
			await sendEmail(envWith({ ...test, EMAIL_TRANSPORT: 'log', DB: d1 }), message);
			expect(sqlite.prepare('SELECT subject FROM dev_mail').all()).toEqual([
				{ subject: message.subject }
			]);
		});

		it.each([
			['EMAIL_TRANSPORT=resend', { EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_key' }],
			['EMAIL_TRANSPORT=postmark', { EMAIL_TRANSPORT: 'postmark', POSTMARK_TOKEN: 'pm_token' }],
			['EMAIL_TRANSPORT=cloudflare', { EMAIL_TRANSPORT: 'cloudflare', EMAIL: { send: vi.fn() } }],
			['RESEND_API_KEY', { EMAIL_TRANSPORT: 'log', RESEND_API_KEY: 're_key' }],
			['POSTMARK_TOKEN', { EMAIL_TRANSPORT: 'log', POSTMARK_TOKEN: 'pm_token' }],
			['the EMAIL binding', { EMAIL_TRANSPORT: 'log', EMAIL: { send: vi.fn() } }]
		])('sends nothing and warns when %s is configured', async (found, config) => {
			const fetch = stubFetch(new Response('{}'));
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const { sqlite, d1 } = fakeD1();

			await sendEmail(envWith({ ...test, DB: d1, ...config }), message);

			expect(fetch).not.toHaveBeenCalled();
			if ('EMAIL' in config) expect(config.EMAIL.send).not.toHaveBeenCalled();
			expect(sqlite.prepare('SELECT * FROM dev_mail').all()).toEqual([]);
			expect(warn).toHaveBeenCalledWith(expect.stringContaining(found));
			warn.mockRestore();
		});
	});

	it('throws naming the value and the allowed transports when EMAIL_TRANSPORT is unknown', async () => {
		await expect(sendEmail(envWith({ EMAIL_TRANSPORT: 'smtp' }), message)).rejects.toThrow(
			'EMAIL_TRANSPORT is "smtp"; expected one of log, cloudflare, resend, postmark'
		);
	});
});
