import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyIdentity, type DidDocument, type Resolvers } from './identity';

const did = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz';
const other = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const handle = 'alice.example.com';

const doc = (alsoKnownAs: string[] = [`at://${handle}`], id = did): DidDocument => ({
	id,
	alsoKnownAs
});

/** Resolvers that answer as given; a handle answer of null means "no record". */
function world(answer: {
	doc?: DidDocument;
	dns?: string | null;
	wellKnown?: string | null;
	profile?: boolean;
}) {
	return {
		didDocument: async () => answer.doc ?? doc(),
		handleViaDns: async () => answer.dns ?? null,
		handleViaWellKnown: async () => answer.wellKnown ?? null,
		hasBskyProfile: async () => answer.profile ?? false
	} satisfies Resolvers;
}

describe('verifyIdentity', () => {
	beforeEach(() => void vi.spyOn(console, 'error').mockImplementation(() => {}));
	afterEach(() => vi.restoreAllMocks());

	const refused = (resolvers: Resolvers, subject = did) =>
		expect(verifyIdentity(subject, resolvers)).resolves.toEqual({
			did: subject,
			handle: null,
			profileUrl: null
		});

	it('verifies a handle that DNS alone confirms', async () => {
		const result = await verifyIdentity(did, world({ dns: did }));
		expect(result.handle).toBe(handle);
	});

	it('verifies a handle that the well-known file alone confirms', async () => {
		const result = await verifyIdentity(did, world({ wellKnown: did }));
		expect(result.handle).toBe(handle);
	});

	it('verifies a handle both methods confirm', async () => {
		const result = await verifyIdentity(did, world({ dns: did, wellKnown: did }));
		expect(result.handle).toBe(handle);
	});

	it('lowercases the handle in the document', async () => {
		const result = await verifyIdentity(
			did,
			world({ doc: doc(['at://Alice.Example.com']), dns: did })
		);
		expect(result.handle).toBe(handle);
	});

	it('links to bsky.app when the account has a profile record', async () => {
		const result = await verifyIdentity(did, world({ dns: did, profile: true }));
		expect(result.profileUrl).toBe(`https://bsky.app/profile/${handle}`);
	});

	it('links to pdsls.dev when it has none', async () => {
		const result = await verifyIdentity(did, world({ dns: did }));
		expect(result.profileUrl).toBe(`https://pdsls.dev/at://${did}`);
	});

	it('refuses when the two methods disagree', () => refused(world({ dns: did, wellKnown: other })));
	it('refuses a handle that resolves to another DID', () => refused(world({ dns: other })));
	it('refuses a handle that resolves to nothing', () => refused(world({})));
	it('refuses a document without an at:// entry', () =>
		refused(world({ doc: doc(['https://alice.example.com']), dns: did })));
	it('refuses a document that is for another DID', () =>
		refused(world({ doc: doc(undefined, other), dns: did })));
	// A document and DNS that both agree with the subject: only the DID's own syntax can refuse it.
	const refusedBeforeLookup = async (subject: string) => {
		const resolvers = world({ doc: doc(undefined, subject), dns: subject });
		const didDocument = vi.spyOn(resolvers, 'didDocument');
		await refused(resolvers, subject);
		expect(didDocument).not.toHaveBeenCalled();
	};
	it('refuses did:key', () =>
		refusedBeforeLookup('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'));
	it('refuses did:web with a path', () => refusedBeforeLookup('did:web:example.com:u'));
	it('refuses a malformed handle', () =>
		refused(world({ doc: doc(['at://-bad-.example.com']), dns: did })));
	it('refuses a one-label handle', () => refused(world({ doc: doc(['at://alice']), dns: did })));
	it.each(['local', 'arpa', 'invalid', 'localhost', 'internal'])('refuses a .%s handle', (tld) =>
		refused(world({ doc: doc([`at://alice.${tld}`]), dns: did }))
	);

	it('logs and answers no handle when a lookup fails', async () => {
		const resolvers = {
			...world({}),
			didDocument: () => Promise.reject(new Error('plc.directory is down'))
		};
		await refused(resolvers);
		expect(console.error).toHaveBeenCalled();
	});

	it('does not count a failed method as agreement', async () => {
		const resolvers = {
			...world({ wellKnown: did }),
			handleViaDns: () => Promise.reject(new Error('dns down'))
		};
		expect((await verifyIdentity(did, resolvers)).handle).toBe(handle);
	});
});
