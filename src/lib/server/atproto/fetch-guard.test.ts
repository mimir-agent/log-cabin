import { describe, expect, it, vi } from 'vitest';
import { guardedFetch, maxRedirects } from './fetch-guard';

const ok = (body = 'ok') => new Response(body);
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });

/** A fetch that answers with these responses in order. */
const answers = (...responses: Response[]) => vi.fn(async () => responses.shift()!);

const refuses = (href: string, fetch = answers(ok()), options = {}) =>
	expect(guardedFetch(href, {}, { fetch, ...options })).rejects.toThrow(/Expected/);

describe('guardedFetch', () => {
	it('returns the status and body of an https domain', async () => {
		const result = await guardedFetch('https://example.com/a', {}, { fetch: answers(ok('hi')) });
		expect(result).toEqual({ status: 200, text: 'hi', headers: expect.any(Headers) });
	});

	it('refuses http:', () => refuses('http://example.com/'));
	it('refuses an IPv4 literal', () => refuses('https://203.0.113.7/'));
	it('refuses an IPv6 literal', () => refuses('https://[2001:db8::1]/'));
	it('refuses localhost', () => refuses('https://localhost/'));
	it('refuses a name under .localhost', () => refuses('https://app.localhost/'));
	it('refuses a single-label host', () => refuses('https://intranet/'));
	it('refuses localhost with a root dot', () => refuses('https://localhost./'));
	it('refuses a name under .localhost with a root dot', () => refuses('https://app.localhost./'));
	it('refuses a single-label host with a root dot', () => refuses('https://intranet./'));

	it('follows three redirects', async () => {
		const fetch = answers(redirect('/1'), redirect('/2'), redirect('/3'), ok('end'));
		expect((await guardedFetch('https://example.com/', {}, { fetch })).text).toBe('end');
	});

	it('refuses a 4th redirect', async () => {
		const fetch = answers(...Array.from({ length: maxRedirects + 1 }, () => redirect('/again')));
		await refuses('https://example.com/', fetch);
	});

	it('refuses a redirect to an IP', async () => {
		const fetch = answers(redirect('https://169.254.169.254/latest'));
		await refuses('https://example.com/', fetch);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('refuses a redirect to http:', () =>
		refuses('https://example.com/', answers(redirect('http://example.com/'))));

	it('refuses an oversized body', () =>
		refuses('https://example.com/', answers(ok('x'.repeat(11))), { maxBytes: 10 }));

	it('refuses a response that outlasts the timeout', async () => {
		const hangs = vi.fn(
			(_url: unknown, init: RequestInit) =>
				new Promise<Response>((_, reject) =>
					init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
				)
		);
		await expect(
			guardedFetch('https://example.com/', {}, { fetch: hangs as never, timeoutMs: 20 })
		).rejects.toThrow(/timed out|aborted/i);
	});

	it('refuses a body that stalls past the timeout', async () => {
		const stalled = new Response(new ReadableStream({ start() {} }));
		await expect(
			guardedFetch('https://example.com/', {}, { fetch: answers(stalled), timeoutMs: 20 })
		).rejects.toThrow(/timed out|aborted/i);
	});
});
