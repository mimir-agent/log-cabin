import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from './testing/fake-d1';
import { isFetchableUrl, linkPreview } from './link-previews';

function world() {
	const { DB } = fakeD1();
	return { DB } as unknown as Env;
}

const html = (head: string) =>
	new Response(`<html><head>${head}</head><body>Hi</body></html>`, {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});

const page = `
	<title>Fallback title</title>
	<meta property="og:title" content="Tents &amp; tarps">
	<meta content="Everything for a dry night." property="og:description">
	<meta property="og:image" content="/img/tent.jpg">`;

/** Stubs fetch with these answers, in order, and returns the mock. */
function answers(...responses: (Response | Error)[]) {
	const fetch = vi.fn(async () => {
		const next = responses.shift();
		if (!next) throw new Error('fetch called more often than the test expected');
		if (next instanceof Error) throw next;
		return next;
	});
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('link previews', () => {
	it('turns a page’s Open Graph tags into a card', async () => {
		answers(html(page));
		expect(await linkPreview(world(), 'https://camp.example/tents')).toEqual({
			kind: 'page',
			url: 'https://camp.example/tents',
			title: 'Tents & tarps',
			description: 'Everything for a dry night.',
			image: 'https://camp.example/img/tent.jpg',
			domain: 'camp.example'
		});
	});

	it('falls back to the page title and host when there are no Open Graph tags', async () => {
		answers(html('<title>Just a page</title>'));
		expect(await linkPreview(world(), 'https://www.plain.example/')).toMatchObject({
			title: 'Just a page',
			domain: 'plain.example',
			image: null
		});
	});

	it('asks without cookies or credentials, and sends nothing of the person asking', async () => {
		const fetch = answers(html(page));
		await linkPreview(world(), 'https://camp.example/tents');
		const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
		expect(Object.keys(init.headers as Record<string, string>).sort()).toEqual([
			'accept',
			'user-agent'
		]);
		expect(init.redirect).toBe('manual');
	});

	it('keeps a preview for 24 hours, then fetches it again', async () => {
		const env = world();
		const fetch = answers(html(page), html('<title>Renamed</title>'));
		await linkPreview(env, 'https://camp.example/tents', 0);
		expect(await linkPreview(env, 'https://camp.example/tents', 23 * 3600_000)).toMatchObject({
			title: 'Tents & tarps'
		});
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(await linkPreview(env, 'https://camp.example/tents', 24 * 3600_000)).toMatchObject({
			title: 'Renamed'
		});
	});

	it('drops an image that isn’t a URL, and still keeps the card for 24 hours', async () => {
		const env = world();
		const fetch = answers(
			html('<title>Broken image</title><meta property="og:image" content="http://[x">')
		);
		const card = { title: 'Broken image', image: null };
		expect(await linkPreview(env, 'https://camp.example/broken', 0)).toMatchObject(card);
		expect(await linkPreview(env, 'https://camp.example/broken', 3600_000)).toMatchObject(card);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('embeds a YouTube link by its video id, titled from oEmbed', async () => {
		const fetch = answers(
			new Response(JSON.stringify({ title: 'Pitching a tent' }), {
				headers: { 'content-type': 'application/json' }
			})
		);
		expect(await linkPreview(world(), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=4')).toEqual({
			kind: 'youtube',
			url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=4',
			videoId: 'dQw4w9WgXcQ',
			title: 'Pitching a tent'
		});
		expect(String((fetch.mock.calls[0] as unknown as [URL])[0])).toMatch(
			/^https:\/\/www\.youtube\.com\/oembed\?/
		);
	});

	it('still embeds a youtu.be link when oEmbed doesn’t answer', async () => {
		answers(new Error('network down'));
		expect(await linkPreview(world(), 'https://youtu.be/dQw4w9WgXcQ')).toMatchObject({
			kind: 'youtube',
			videoId: 'dQw4w9WgXcQ',
			title: null
		});
	});

	it('leaves a plain link when the site is down, slow, missing or not a page', async () => {
		const timeout = new DOMException('The operation timed out.', 'TimeoutError');
		answers(
			new Error('connection refused'),
			timeout,
			new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } }),
			new Response('%PDF', { headers: { 'content-type': 'application/pdf' } })
		);
		const env = world();
		for (const path of ['down', 'slow', 'missing', 'file.pdf']) {
			expect(await linkPreview(env, `https://camp.example/${path}`), path).toBeNull();
		}
	});

	it('gives up after 5 seconds', async () => {
		const timeout = vi.spyOn(AbortSignal, 'timeout');
		answers(html(page));
		await linkPreview(world(), 'https://camp.example/tents');
		expect(timeout).toHaveBeenCalledWith(5000);
	});
});

describe('the link preview fetch refuses anything but public web pages', () => {
	it.each([
		['loopback by name', 'http://localhost/admin'],
		['a localhost subdomain', 'http://api.localhost/'],
		['loopback by address', 'http://127.0.0.1/'],
		['loopback as a decimal number', 'http://2130706433/'],
		['loopback in hex', 'http://0x7f.0.0.1/'],
		['IPv6 loopback', 'http://[::1]/'],
		['the unspecified address', 'http://0.0.0.0/'],
		['a 10/8 private address', 'http://10.1.2.3/'],
		['a 172.16/12 private address', 'http://172.20.0.5/'],
		['a 192.168/16 private address', 'http://192.168.1.1/'],
		['the cloud metadata address', 'http://169.254.169.254/latest/meta-data'],
		['carrier-grade NAT', 'http://100.64.0.1/'],
		['an intranet name', 'http://intranet/'],
		['a .internal name', 'https://db.internal/'],
		['loopback by name with a trailing dot', 'http://localhost./'],
		['a localhost subdomain with a trailing dot', 'http://foo.localhost./'],
		['the cloud metadata name with a trailing dot', 'http://metadata.google.internal./'],
		['a .local name with a trailing dot', 'http://a.local./'],
		['an intranet name with a trailing dot', 'http://intranet./'],
		['a non-default port', 'https://example.com:8443/'],
		['credentials in the URL', 'https://user:secret@example.com/'],
		['ftp', 'ftp://example.com/file'],
		['file', 'file:///etc/passwd'],
		['javascript', 'javascript:alert(1)'],
		['data', 'data:text/html,hi']
	])('refuses %s', async (_, address) => {
		expect(isFetchableUrl(new URL(address))).toBe(false);
		const fetch = answers();
		expect(await linkPreview(world(), address)).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('allows public hosts and addresses', () => {
		for (const address of [
			'https://example.com/a',
			'http://93.184.215.14/',
			'https://172.32.0.1/'
		]) {
			expect(isFetchableUrl(new URL(address)), address).toBe(true);
		}
	});

	it('won’t follow a redirect to a private address', async () => {
		const fetch = answers(
			new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })
		);
		expect(await linkPreview(world(), 'https://camp.example/r')).toBeNull();
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('follows a redirect to another public page', async () => {
		answers(
			new Response(null, { status: 301, headers: { location: '/new' } }),
			html('<title>Moved</title>')
		);
		expect(await linkPreview(world(), 'https://camp.example/old')).toMatchObject({
			title: 'Moved',
			url: 'https://camp.example/new'
		});
	});

	it('reads no more than 1 MB of a page, however much it sends', async () => {
		const chunk = new Uint8Array(64 * 1024).fill(32);
		let sent = 0;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('<head><title>Huge</title>'));
			},
			pull(controller) {
				sent += chunk.byteLength;
				controller.enqueue(chunk);
			}
		});
		answers(
			new Response(body, {
				headers: { 'content-type': 'text/html', 'content-length': String(50 * 1024 * 1024) }
			})
		);
		expect(await linkPreview(world(), 'https://camp.example/huge')).toMatchObject({
			title: 'Huge'
		});
		expect(sent, 'bytes pulled from the site').toBeLessThanOrEqual(
			1024 * 1024 + 2 * chunk.byteLength
		);
	});

	it('shows nothing when a page’s tags come after its first 1 MB', async () => {
		const padding = ' '.repeat(1024 * 1024);
		answers(html(`${padding}<title>Too late</title>`));
		expect(await linkPreview(world(), 'https://camp.example/late')).toBeNull();
	});
});
