import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchResolvers } from './resolvers';

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz';

function answer(body: string, status = 200) {
	const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(body, { status }));
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

describe('fetchResolvers', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('reads the DID from a DNS TXT answer over DNS-over-HTTPS', async () => {
		const fetch = answer(JSON.stringify({ Answer: [{ data: `"did=${did}"` }] }));
		expect(await fetchResolvers.handleViaDns('alice.example.com')).toBe(did);
		expect(String(fetch.mock.calls[0][0])).toContain('_atproto.alice.example.com');
	});

	it('answers null for two different DNS records', async () => {
		answer(JSON.stringify({ Answer: [{ data: `"did=${did}"` }, { data: '"did=did:plc:b"' }] }));
		expect(await fetchResolvers.handleViaDns('alice.example.com')).toBeNull();
	});

	it('answers null when the well-known file is missing', async () => {
		answer('', 404);
		expect(await fetchResolvers.handleViaWellKnown('alice.example.com')).toBeNull();
	});

	it('reads the DID from the well-known file', async () => {
		answer(`${did}\n`);
		expect(await fetchResolvers.handleViaWellKnown('alice.example.com')).toBe(did);
	});

	it('asks plc.directory for a did:plc document', async () => {
		const fetch = answer(JSON.stringify({ id: did }));
		await fetchResolvers.didDocument(did);
		expect(String(fetch.mock.calls[0][0])).toBe(`https://plc.directory/${did}`);
	});

	it('asks the host for a did:web document', async () => {
		const fetch = answer(JSON.stringify({ id: 'did:web:example.com' }));
		await fetchResolvers.didDocument('did:web:example.com');
		expect(String(fetch.mock.calls[0][0])).toBe('https://example.com/.well-known/did.json');
	});
});
