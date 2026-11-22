import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import type { LinkPreview } from '../link-preview';

// Link previews: the server fetches a page's Open Graph tags (or, for YouTube, its oEmbed
// title) so a pasted link can show as a card. The fetch never carries anyone's cookies or
// credentials, goes only to http(s) on the default ports, gives up after 5 seconds, and reads
// at most 1 MB. Any failure leaves the link a plain link.
//
// The guard below refuses hosts that are private as written: loopback and private addresses,
// and names like localhost or *.internal. It doesn't resolve names. It relies on Workers'
// outbound fetch, which can't reach a private network, so a public name that resolves to a
// private address is left to the platform.

const previewTimeoutMs = 5000;
const previewMaxBytes = 1024 * 1024;
const cacheMs = 24 * 60 * 60 * 1000;
const maxRedirects = 3;

/** Hostnames that name this machine or a private network rather than a public site. */
const privateSuffixes = ['localhost', '.localhost', '.local', '.internal', '.home.arpa'];

/** IPv4 blocks that aren't the public internet: [first octets, prefix length]. */
const privateIPv4: [number[], number][] = [
	[[0], 8],
	[[10], 8],
	[[100, 64], 10],
	[[127], 8],
	[[169, 254], 16],
	[[172, 16], 12],
	[[192, 0, 0], 24],
	[[192, 168], 16],
	[[198, 18], 15],
	[[224], 4],
	[[240], 4]
];

function ipv4InBlock(address: number, [octets, bits]: [number[], number]) {
	const base = octets.reduce((n, octet, i) => n + octet * 256 ** (3 - i), 0);
	const size = 2 ** (32 - bits);
	return address >= base && address < base + size;
}

/**
 * Whether the server may fetch this URL: http(s), no credentials in it, the default port, and
 * a host that isn't loopback, private, link-local or a bare intranet name. The URL parser has
 * already turned decimal, hex and octal IPv4 forms into dotted quads, but it keeps a name's
 * trailing dot (`localhost.` is localhost), so that is stripped before the name checks. IPv6
 * literals are all refused: links shared by IPv6 address aren't worth classifying every range
 * for.
 */
export function isFetchableUrl(url: URL): boolean {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
	if (url.username || url.password || url.port) return false;
	const host = url.hostname.toLowerCase().replace(/\.$/, '');
	if (host.startsWith('[')) return false;
	if (!host.includes('.') || privateSuffixes.some((suffix) => host.endsWith(suffix))) return false;
	const quad = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
	if (!quad) return true;
	const address = quad.slice(1).reduce((n, octet) => n * 256 + Number(octet), 0);
	return !privateIPv4.some((block) => ipv4InBlock(address, block));
}

/** Reads at most maxBytes of the body, then stops the download. */
export async function readCapped(
	response: Response,
	maxBytes: number
): Promise<Uint8Array<ArrayBuffer>> {
	const reader = response.body!.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (total < maxBytes) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value.subarray(0, maxBytes - total));
		total += value.byteLength;
	}
	await reader.cancel();
	const bytes = new Uint8Array(Math.min(total, maxBytes));
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

/**
 * GETs a public URL, following up to three redirects and checking each hop, and returns its
 * final URL and answer, its body unread. Null when a hop's host is refused, the fetch fails or
 * there are more redirects than that.
 */
export async function fetchPublicResponse(start: URL, accept: string, signal: AbortSignal) {
	let url = start;
	for (let hop = 0; hop <= maxRedirects; hop++) {
		if (!isFetchableUrl(url)) return null;
		let response: Response;
		try {
			response = await fetch(url, {
				redirect: 'manual',
				headers: { accept, 'user-agent': 'Mozilla/5.0 (compatible; CampfireLinkPreview/1.0)' },
				signal
			});
		} catch {
			return null;
		}
		const location = response.headers.get('location');
		if (response.status >= 300 && response.status < 400 && location) {
			await response.body?.cancel();
			url = new URL(location, url);
			continue;
		}
		return { url, response };
	}
	return null;
}

/**
 * The final URL and the first 1 MB of a public URL's body when it answers 200 with the
 * expected type. Null when the host is refused, the site is down, slow or answers otherwise: a
 * preview is a nicety, and the link is still there without one.
 */
async function fetchPublic(start: URL, accept: string, type: RegExp, signal: AbortSignal) {
	const answer = await fetchPublicResponse(start, accept, signal);
	if (!answer) return null;
	const { url, response } = answer;
	if (response.status !== 200 || !type.test(response.headers.get('content-type') ?? '')) {
		await response.body?.cancel();
		return null;
	}
	try {
		return { url, body: new TextDecoder().decode(await readCapped(response, previewMaxBytes)) };
	} catch {
		return null;
	}
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
		if (name[0] !== '#') return entities[name.toLowerCase()] ?? whole;
		const code =
			name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
		return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
	});
}

/** The page's <meta> tags, keyed by lowercased property or name, first one winning. */
function metaTags(html: string): Map<string, string> {
	const tags = new Map<string, string>();
	for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
		const attrs = new Map<string, string>();
		for (const m of tag.matchAll(/([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
			attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4]);
		}
		const key = (attrs.get('property') ?? attrs.get('name'))?.toLowerCase();
		const content = attrs.get('content');
		if (key && content && !tags.has(key)) tags.set(key, decodeEntities(content).trim());
	}
	return tags;
}

function clip(text: string | undefined, max: number): string | null {
	if (!text) return null;
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The card for an HTML page, or null when it has no title to show. */
function pagePreview(html: string, url: URL): LinkPreview | null {
	const meta = metaTags(html);
	const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
	const title = clip(
		meta.get('og:title') ??
			meta.get('twitter:title') ??
			(titleTag && decodeEntities(titleTag).trim()),
		200
	);
	if (!title) return null;
	const imageSource = meta.get('og:image') ?? meta.get('twitter:image');
	// A tag that doesn't parse as a URL is a broken tag: the card goes without an image.
	const image = imageSource && URL.canParse(imageSource, url) ? new URL(imageSource, url) : null;
	return {
		kind: 'page',
		url: url.href,
		title,
		description: clip(
			meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'),
			300
		),
		// Only https images: an http one would be mixed content on our https pages.
		image: image?.protocol === 'https:' ? image.href : null,
		domain: url.hostname.replace(/^www\./, '')
	};
}

const videoIdPattern = /^[\w-]{11}$/;

/** The video id of a YouTube watch, share, shorts, live or embed link. */
function youtubeVideoId(url: URL): string | null {
	const host = url.hostname.replace(/^(www|m|music)\./, '');
	const id =
		host === 'youtu.be'
			? url.pathname.slice(1)
			: host === 'youtube.com'
				? url.pathname === '/watch'
					? url.searchParams.get('v')
					: /^\/(?:shorts|live|embed)\/([^/]+)/.exec(url.pathname)?.[1]
				: null;
	return id && videoIdPattern.test(id) ? id : null;
}

/**
 * A video's thumbnail fetched from YouTube's image host, for passing on to the browser so it
 * loads nothing from YouTube before someone presses play. Null for a string that isn't a video
 * id, or when YouTube has no thumbnail for it.
 */
export async function youtubeThumbnail(videoId: string): Promise<Response | null> {
	if (!videoIdPattern.test(videoId)) return null;
	const response = await fetch(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, {
		signal: AbortSignal.timeout(previewTimeoutMs)
	});
	if (response.ok) return response;
	await response.body?.cancel();
	return null;
}

/** The title in an oEmbed answer; null for an answer that isn't the JSON oEmbed promises. */
function oembedTitle(body: string): string | null {
	try {
		const { title } = JSON.parse(body) as { title?: unknown };
		return typeof title === 'string' ? clip(title, 200) : null;
	} catch {
		return null;
	}
}

async function fetchPreview(url: URL): Promise<LinkPreview | null> {
	const signal = AbortSignal.timeout(previewTimeoutMs);
	const videoId = youtubeVideoId(url);
	if (videoId) {
		const oembed = new URL('https://www.youtube.com/oembed?format=json');
		oembed.searchParams.set('url', url.href);
		const answer = await fetchPublic(oembed, 'application/json', /json/, signal);
		return { kind: 'youtube', url: url.href, videoId, title: answer && oembedTitle(answer.body) };
	}
	const page = await fetchPublic(
		url,
		'text/html',
		/^\s*(text\/html|application\/xhtml\+xml)/i,
		signal
	);
	return page && pagePreview(page.body, page.url);
}

/**
 * The preview for a link, from the 24-hour cache or fetched now. Null for anything that can't
 * be fetched or shows nothing: the page shows the plain link.
 */
export async function linkPreview(env: Env, raw: string, now = Date.now()) {
	if (!URL.canParse(raw)) return null;
	const url = new URL(raw);
	if (!isFetchableUrl(url)) return null;
	const { linkPreviews } = schema;
	const cached = await db(env)
		.select()
		.from(linkPreviews)
		.where(eq(linkPreviews.url, url.href))
		.get();
	if (cached && now - cached.fetchedAt < cacheMs) {
		return cached.preview === null ? null : (JSON.parse(cached.preview) as LinkPreview);
	}
	const preview = await fetchPreview(url);
	const row = { preview: preview && JSON.stringify(preview), fetchedAt: now };
	await db(env)
		.insert(linkPreviews)
		.values({ url: url.href, ...row })
		.onConflictDoUpdate({ target: linkPreviews.url, set: row });
	return preview;
}
