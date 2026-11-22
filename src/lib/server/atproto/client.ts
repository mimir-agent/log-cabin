import { eq } from 'drizzle-orm';
import {
	CompositeDidDocumentResolver,
	CompositeHandleResolver,
	DohJsonHandleResolver,
	LocalActorResolver,
	PlcDidDocumentResolver,
	WebDidDocumentResolver,
	WellKnownHandleResolver
} from '@atcute/identity-resolver';
import {
	MemoryStore,
	OAuthClient,
	type ClientAssertionPrivateJwk,
	type StateStore,
	type StoredSession,
	type StoredState
} from '@atcute/oauth-node-client';
import { db, schema } from '../db';
import { getOrg } from '../org';
import { guardedFetch } from './fetch-guard';

// Each deployment is its own AT Protocol OAuth client. Its identity is APP_URL: the client id,
// the redirect and every other URL are built from it, never from the host of a request.
// The client asks for identity only (scope "atproto") and writes nothing to anyone's PDS.

const dnsOverHttps = 'https://cloudflare-dns.com/dns-query';

type ClientMode = 'confidential' | 'loopback';

function clientKey(env: Env): ClientAssertionPrivateJwk | null {
	let key;
	try {
		key = JSON.parse(env.ATPROTO_CLIENT_KEY ?? '');
	} catch {
		return null;
	}
	const isP256Private =
		key?.kty === 'EC' &&
		key.crv === 'P-256' &&
		key.alg === 'ES256' &&
		[key.kid, key.d, key.x, key.y].every((part) => typeof part === 'string');
	return isP256Private ? key : null;
}

/** Loopback only for an http address on this machine; an https APP_URL is never loopback. */
function clientMode(env: Env): ClientMode | null {
	if (!env.APP_URL || !URL.canParse(env.APP_URL)) return null;
	const { protocol, hostname } = new URL(env.APP_URL);
	if (protocol === 'http:' && (hostname === '127.0.0.1' || hostname === 'localhost'))
		return 'loopback';
	return protocol === 'https:' && clientKey(env) ? 'confidential' : null;
}

export const atSignInConfigured = (env: Env): boolean => clientMode(env) !== null;

/** AT Protocol sign-in shows only when the deployment can do it and the org has it on. */
export async function atSignInOffered(env: Env): Promise<boolean> {
	return atSignInConfigured(env) && (await getOrg(env)).atSignIn;
}

/** The fetch the client uses for every request to a host a user or a remote document names. */
const guarded: typeof fetch = async (input, init) => {
	const request = new Request(input, init);
	const body = request.body ? await request.text() : undefined;
	const { status, text, headers } = await guardedFetch(request.url, {
		method: request.method,
		headers: request.headers,
		body
	});
	return new Response(text, { status, headers });
};

/** Each state is read once: reading it deletes it, so a replayed callback finds nothing. */
class StateRows implements StateStore {
	constructor(private env: Env) {}

	async get(key: string) {
		const row = await db(this.env)
			.delete(schema.atprotoOauthStates)
			.where(eq(schema.atprotoOauthStates.key, key))
			.returning()
			.get();
		if (!row || row.expiresAt < Date.now()) return undefined;
		return JSON.parse(row.value) as StoredState;
	}

	async set(key: string, value: StoredState) {
		await db(this.env)
			.insert(schema.atprotoOauthStates)
			.values({ key, value: JSON.stringify(value), expiresAt: value.expiresAt });
	}

	async delete(key: string) {
		await db(this.env)
			.delete(schema.atprotoOauthStates)
			.where(eq(schema.atprotoOauthStates.key, key));
	}

	async clear() {
		await db(this.env).delete(schema.atprotoOauthStates);
	}
}

/** The client for this deployment. Throws when AT sign-in isn't configured. */
export async function atClient(env: Env, fetch: typeof globalThis.fetch = guarded) {
	const mode = clientMode(env);
	if (!mode)
		throw new Error(
			'Expected an https APP_URL with ATPROTO_CLIENT_KEY set to an ES256 P-256 private JWK, or a loopback APP_URL; got neither.'
		);
	const origin = new URL(env.APP_URL!).origin;
	const common = {
		actorResolver: new LocalActorResolver({
			handleResolver: new CompositeHandleResolver({
				methods: {
					dns: new DohJsonHandleResolver({ dohUrl: dnsOverHttps, fetch }),
					http: new WellKnownHandleResolver({ fetch })
				}
			}),
			didDocumentResolver: new CompositeDidDocumentResolver({
				methods: {
					plc: new PlcDidDocumentResolver({ fetch }),
					web: new WebDidDocumentResolver({ fetch })
				}
			})
		}),
		// The tokens are never kept: sign-in revokes the session as soon as it has the DID.
		stores: { sessions: new MemoryStore<string, StoredSession>(), states: new StateRows(env) },
		fetch
	};
	if (mode === 'loopback') {
		// RFC 8252 refuses the name "localhost" in a loopback redirect, so it is the address.
		const { port } = new URL(env.APP_URL!);
		const redirect = `http://127.0.0.1:${port}/oauth/callback`;
		return new OAuthClient({
			...common,
			metadata: { redirect_uris: [redirect], scope: 'atproto' }
		});
	}
	const redirect_uris = [`${origin}/oauth/callback`];
	return new OAuthClient({
		...common,
		keyset: [clientKey(env)!],
		metadata: {
			client_id: `${origin}/oauth-client-metadata.json`,
			client_name: (await getOrg(env)).name,
			client_uri: origin,
			redirect_uris,
			scope: 'atproto',
			jwks_uri: `${origin}/oauth/jwks.json`
		}
	});
}

/** The two documents a PDS fetches, or null when this deployment isn't a hosted client. */
export async function clientDocuments(env: Env) {
	if (clientMode(env) !== 'confidential') return null;
	const client = await atClient(env);
	// subject_type "public" is the default, so the document leaves it out.
	const metadata: Record<string, unknown> = { ...client.metadata };
	delete metadata.subject_type;
	return { metadata, jwks: client.jwks! };
}
