import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailRejected, sendEmail, sendEmailOnce } from './index';
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
const from = 'Log Cabin <campfire@example.com>';

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

	describe('through the EMAIL binding, when EMAIL_TRANSPORT is cloudflare', () => {
		const binding = () => ({
			send: vi.fn<(message: unknown) => Promise<{ messageId: string }>>(async () => ({
				messageId: 'm1'
			}))
		});
		const cloudflare = (EMAIL: ReturnType<typeof binding>, overrides = {}) =>
			envWith({ EMAIL_TRANSPORT: 'cloudflare', EMAIL, ...overrides });

		it('sends the parts with the sender split into name and address', async () => {
			const EMAIL = binding();
			await sendEmail(cloudflare(EMAIL), message);
			expect(EMAIL.send.mock.calls).toEqual([
				[
					{
						from: { name: 'Log Cabin', email: 'campfire@example.com' },
						to: message.to,
						subject: message.subject,
						html: message.html,
						text: message.text
					}
				]
			]);
		});

		it('sends a sender with no name as the plain address', async () => {
			const EMAIL = binding();
			await sendEmail(cloudflare(EMAIL, { EMAIL_FROM: 'campfire@example.com' }), message);
			expect(EMAIL.send.mock.calls[0][0]).toMatchObject({ from: 'campfire@example.com' });
		});

		it('adds Reply-To when EMAIL_REPLY_TO is set, and none when it is not', async () => {
			const withReply = binding();
			await sendEmail(cloudflare(withReply, { EMAIL_REPLY_TO: 'help@example.com' }), message);
			expect(withReply.send.mock.calls[0][0]).toMatchObject({ replyTo: 'help@example.com' });

			const without = binding();
			await sendEmail(cloudflare(without), message);
			expect(without.send.mock.calls[0][0]).not.toHaveProperty('replyTo');
		});

		it('passes the message’s headers on, and none when it has none', async () => {
			const EMAIL = binding();
			const headers = { 'List-Unsubscribe': '<https://campfire.test/settings/notifications>' };
			await sendEmail(cloudflare(EMAIL), { ...message, headers });
			expect(EMAIL.send.mock.calls[0][0]).toMatchObject({ headers });

			await sendEmail(cloudflare(EMAIL), message);
			expect(EMAIL.send.mock.calls[1][0]).not.toHaveProperty('headers');
		});

		const refusedWith = (code: string) =>
			cloudflare({
				send: vi.fn(async () => {
					throw Object.assign(new Error(`${code} from Cloudflare`), { code });
				})
			});

		it.each([
			'E_RECIPIENT_SUPPRESSED',
			'E_RECIPIENT_NOT_ALLOWED',
			'E_VALIDATION_ERROR',
			'E_SENDER_NOT_VERIFIED',
			'E_SENDER_DOMAIN_NOT_AVAILABLE',
			'E_HEADER_VALUE_INVALID',
			'E_HEADERS_TOO_LARGE'
		])('throws EmailRejected, which is never retried, for %s', async (code) => {
			const error = await sendEmail(refusedWith(code), message).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(EmailRejected);
			expect(error).toMatchObject({ code });
			expect((error as Error).message).toContain(`${code} from Cloudflare`);
		});

		it.each([
			'E_RATE_LIMIT_EXCEEDED',
			'E_DAILY_LIMIT_EXCEEDED',
			'E_INTERNAL_SERVER_ERROR',
			'E_DELIVERY_FAILED'
		])('throws %s as it came, for the retry to send again', async (code) => {
			const error = await sendEmail(refusedWith(code), message).catch((e: unknown) => e);
			expect(error).not.toBeInstanceOf(EmailRejected);
			expect(error).toMatchObject({ code });
		});

		it('sendEmailOnce logs a rejection and returns, and throws what can be retried', async () => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			await sendEmailOnce(refusedWith('E_RECIPIENT_SUPPRESSED'), message);
			expect(error).toHaveBeenCalledWith(
				expect.stringContaining(`to ${message.to}`),
				expect.any(EmailRejected)
			);
			error.mockRestore();

			await expect(sendEmailOnce(refusedWith('E_RATE_LIMIT_EXCEEDED'), message)).rejects.toThrow(
				'E_RATE_LIMIT_EXCEEDED from Cloudflare'
			);
		});
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
