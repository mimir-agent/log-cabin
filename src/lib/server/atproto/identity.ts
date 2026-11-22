import { fetchResolvers } from './resolvers';

// An account's handle is shown only when it checks out both ways: the DID's document names
// the handle, and the handle resolves back to the same DID. The DID is the key; the handle
// is for display.

export type DidDocument = {
	id?: string;
	alsoKnownAs?: string[];
	service?: { id: string; serviceEndpoint: string }[];
};

/** The lookups verification needs. A handle lookup answers null when the handle has no record. */
export type Resolvers = {
	didDocument(did: string): Promise<DidDocument>;
	handleViaDns(handle: string): Promise<string | null>;
	handleViaWellKnown(handle: string): Promise<string | null>;
	/** Whether the DID's repo holds an app.bsky.actor.profile record. */
	hasBskyProfile(doc: DidDocument): Promise<boolean>;
};

export type Identity = { did: string; handle: string | null; profileUrl: string | null };

const didPattern = /^did:(plc:[a-z2-7]{24}|web:[a-z0-9.-]+)$/;
const labelPattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const reservedTlds = ['local', 'arpa', 'invalid', 'localhost', 'internal'];

/** The handle syntax of the atproto spec, minus the reserved TLDs. Throws on anything else. */
function assertHandle(handle: string) {
	const labels = handle.split('.');
	const tld = labels.at(-1)!;
	const valid =
		handle.length <= 253 &&
		labels.length >= 2 &&
		labels.every((label) => labelPattern.test(label)) &&
		/^[a-z]/.test(tld) &&
		!reservedTlds.includes(tld);
	if (!valid)
		throw new Error(
			`Expected a public lowercase handle with at least two labels, got "${handle}".`
		);
}

async function verifiedHandle(did: string, doc: DidDocument, resolvers: Resolvers) {
	if (doc.id !== did) throw new Error(`Expected the document of ${did}, got one for ${doc.id}.`);
	const aka = doc.alsoKnownAs?.find((entry) => entry.startsWith('at://'));
	if (!aka) throw new Error(`Expected ${did}'s document to list an at:// handle, found none.`);
	const handle = aka.slice('at://'.length).toLowerCase();
	assertHandle(handle);

	const [dns, wellKnown] = await Promise.allSettled([
		resolvers.handleViaDns(handle),
		resolvers.handleViaWellKnown(handle)
	]);
	const answers = [dns, wellKnown].flatMap((r) =>
		r.status === 'fulfilled' && r.value ? [r.value] : []
	);
	if (answers.length === 0) {
		const failed = [dns, wellKnown].find((r) => r.status === 'rejected');
		throw failed
			? failed.reason
			: new Error(`Expected ${handle} to name ${did} in DNS or well-known, found nothing.`);
	}
	if (answers.some((answer) => answer !== did)) {
		throw new Error(
			`Expected ${handle} to resolve to ${did} by every method, got ${answers.join(' and ')}.`
		);
	}
	return handle;
}

/** Never throws on a remote failure: it logs and answers with no handle. */
export async function verifyIdentity(
	did: string,
	resolvers: Resolvers = fetchResolvers
): Promise<Identity> {
	try {
		if (!didPattern.test(did))
			throw new Error(`Expected a did:plc or did:web identifier, got "${did}".`);
		const doc = await resolvers.didDocument(did);
		const handle = await verifiedHandle(did, doc, resolvers);
		const profileUrl = (await resolvers.hasBskyProfile(doc))
			? `https://bsky.app/profile/${handle}`
			: `https://pdsls.dev/at://${did}`;
		return { did, handle, profileUrl };
	} catch (error) {
		console.error(`Handle of ${did} not verified:`, error);
		return { did, handle: null, profileUrl: null };
	}
}
