// Every outbound fetch to a host the user or a remote document names (a handle, a did:web
// host, a PDS) goes through here: https only, a real domain name, a short life, a capped
// body and a few redirects that are each checked again.

export const timeoutMs = 5_000;
export const maxBytes = 64 * 1024;
export const maxRedirects = 3;

export class FetchRefused extends Error {}

function assertPublicHttps(url: URL) {
	const refuse = (why: string) => {
		throw new FetchRefused(
			`Expected an https URL on a public domain name, got ${url.href}: ${why}.`
		);
	};
	if (url.protocol !== 'https:') refuse('the scheme is not https');
	// A name may end in the root dot ("localhost." is localhost).
	const host = url.hostname.replace(/\.$/, '');
	if (host.startsWith('[')) refuse('the host is an IPv6 literal');
	if (!host.includes('.')) refuse('the host is a single label');
	if (/^\d+$/.test(host.split('.').at(-1)!)) refuse('the host is an IPv4 literal');
	if (host === 'localhost' || host.endsWith('.localhost')) refuse('the host is localhost');
}

export type GuardOptions = { fetch?: typeof fetch; timeoutMs?: number; maxBytes?: number };

export type Guarded = { status: number; text: string; headers: Headers };

/** Fetches `href` and returns its status and body text. Throws FetchRefused or the fetch's own error. */
export async function guardedFetch(
	href: string,
	init: RequestInit = {},
	options: GuardOptions = {}
): Promise<Guarded> {
	const doFetch = options.fetch ?? fetch;
	const limit = options.maxBytes ?? maxBytes;
	const signal = AbortSignal.timeout(options.timeoutMs ?? timeoutMs);
	let url = new URL(href);
	for (let redirects = 0; ; redirects++) {
		assertPublicHttps(url);
		const response = await doFetch(url, { ...init, redirect: 'manual', signal });
		const location = response.headers.get('location');
		if (response.status < 300 || response.status >= 400 || !location) {
			return {
				status: response.status,
				headers: response.headers,
				text: await readCapped(response, limit, signal)
			};
		}
		if (redirects === maxRedirects) {
			throw new FetchRefused(
				`Expected at most ${maxRedirects} redirects, ${url.href} sent a ${redirects + 1}th.`
			);
		}
		await response.body?.cancel();
		url = new URL(location, url);
	}
}

async function readCapped(response: Response, limit: number, signal: AbortSignal) {
	if (!response.body) return '';
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	signal.addEventListener('abort', () => void reader.cancel(signal.reason));
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		signal.throwIfAborted();
		size += value.byteLength;
		if (size > limit) {
			await reader.cancel();
			throw new FetchRefused(
				`Expected a body of at most ${limit} bytes from ${response.url}, got more.`
			);
		}
		chunks.push(value);
	}
	signal.throwIfAborted();
	return new Blob(chunks as BlobPart[]).text();
}
