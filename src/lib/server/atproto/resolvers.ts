import { guardedFetch } from './fetch-guard';
import type { DidDocument, Resolvers } from './identity';

const dnsOverHttps = 'https://cloudflare-dns.com/dns-query';

async function getJson(href: string, init: RequestInit = {}) {
	const { status, text } = await guardedFetch(href, init);
	if (status !== 200) throw new Error(`Expected 200 from ${href}, got ${status}.`);
	return JSON.parse(text);
}

/** The DID in a handle's well-known file or DNS record, or null when the handle has none. */
const didOrNull = (text: string) => (text.trim().startsWith('did:') ? text.trim() : null);

export const fetchResolvers: Resolvers = {
	didDocument(did) {
		const url = did.startsWith('did:plc:')
			? `https://plc.directory/${did}`
			: `https://${did.slice('did:web:'.length)}/.well-known/did.json`;
		return getJson(url) as Promise<DidDocument>;
	},

	async handleViaDns(handle) {
		const query = new URLSearchParams({ name: `_atproto.${handle}`, type: 'TXT' });
		const body = await getJson(`${dnsOverHttps}?${query}`, {
			headers: { accept: 'application/dns-json' }
		});
		const dids = ((body.Answer ?? []) as { data: string }[])
			.map((answer) => answer.data.replace(/^"|"$/g, ''))
			.filter((data) => data.startsWith('did='))
			.map((data) => data.slice('did='.length));
		return dids.length === 1 ? dids[0] : null;
	},

	async handleViaWellKnown(handle) {
		const { status, text } = await guardedFetch(`https://${handle}/.well-known/atproto-did`);
		return status === 200 ? didOrNull(text) : null;
	},

	async hasBskyProfile(doc) {
		const pds = doc.service?.find((s) => s.id === '#atproto_pds')?.serviceEndpoint;
		if (!pds) return false;
		const query = new URLSearchParams({
			repo: doc.id!,
			collection: 'app.bsky.actor.profile',
			rkey: 'self'
		});
		try {
			const { status } = await guardedFetch(`${pds}/xrpc/com.atproto.repo.getRecord?${query}`);
			return status === 200;
		} catch {
			return false;
		}
	}
};
