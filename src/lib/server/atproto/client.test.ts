import { generateKeyPairSync, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, schema } from '#lib/server/db/index.js';
import { createOrgAndAdmin } from '#lib/server/setup.js';
import { fakeEnv } from '#lib/server/testing/fake-d1.js';
import { GET as getJwks } from '../../../routes/oauth/jwks.json/+server';
import { GET as getMetadata } from '../../../routes/oauth-client-metadata.json/+server';
import { atClient, atSignInConfigured, atSignInOffered } from './client';

const appUrl = 'https://chat.example.com';

function newKey(kid = 'lc-20261121') {
	const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
	return { ...privateKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'ES256' };
}

const key = newKey();
const keyJson = JSON.stringify(key);

async function orgEnv(vars: Partial<Env>) {
	const env = fakeEnv(vars);
	await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' });
	return env;
}

const call = (handler: (event: never) => Response | Promise<Response>) =>
	Promise.resolve(handler({} as never));

describe('the two documents', () => {
	beforeEach(() => void fakeEnv());

	it('publishes the client metadata of G-AT2 and nothing else', async () => {
		await orgEnv({ APP_URL: appUrl, ATPROTO_CLIENT_KEY: keyJson });
		const response = await call(getMetadata);
		expect(await response.json()).toEqual({
			application_type: 'web',
			client_id: `${appUrl}/oauth-client-metadata.json`,
			client_name: 'Acme',
			client_uri: appUrl,
			redirect_uris: [`${appUrl}/oauth/callback`],
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			scope: 'atproto',
			dpop_bound_access_tokens: true,
			token_endpoint_auth_method: 'private_key_jwt',
			token_endpoint_auth_signing_alg: 'ES256',
			jwks_uri: `${appUrl}/oauth/jwks.json`
		});
	});

	it('builds every URL from APP_URL, not from a trailing slash or path in it', async () => {
		await orgEnv({ APP_URL: `${appUrl}/some/path/`, ATPROTO_CLIENT_KEY: keyJson });
		const metadata = (await (await call(getMetadata)).json()) as { client_id: string };
		expect(metadata.client_id).toBe(`${appUrl}/oauth-client-metadata.json`);
	});

	it('publishes the public half of the key: no d', async () => {
		await orgEnv({ APP_URL: appUrl, ATPROTO_CLIENT_KEY: keyJson });
		const { keys } = (await (await call(getJwks)).json()) as { keys: object[] };
		expect(keys).toEqual([
			{ kty: 'EC', crv: 'P-256', x: key.x, y: key.y, kid: key.kid, use: 'sig', alg: 'ES256' }
		]);
		expect(keys[0]).not.toHaveProperty('d');
	});

	it('caches both for five minutes', async () => {
		await orgEnv({ APP_URL: appUrl, ATPROTO_CLIENT_KEY: keyJson });
		for (const handler of [getMetadata, getJwks]) {
			expect((await call(handler)).headers.get('cache-control')).toBe('public, max-age=300');
		}
	});

	it.each([
		['no key', { APP_URL: appUrl }],
		['a key that is not JSON', { APP_URL: appUrl, ATPROTO_CLIENT_KEY: 'nope' }],
		['an http APP_URL', { APP_URL: 'http://chat.example.com', ATPROTO_CLIENT_KEY: keyJson }],
		['no APP_URL', { ATPROTO_CLIENT_KEY: keyJson }],
		['a loopback APP_URL', { APP_URL: 'http://127.0.0.1:5173' }]
	])('answer 404 with %s', async (_name, vars) => {
		await orgEnv(vars);
		for (const handler of [getMetadata, getJwks]) {
			await expect(call(handler)).rejects.toMatchObject({ status: 404 });
		}
	});

	it('are served whether or not the org has AT sign-in on', async () => {
		const env = await orgEnv({ APP_URL: appUrl, ATPROTO_CLIENT_KEY: keyJson });
		expect(await atSignInOffered(env)).toBe(false);
		expect((await call(getMetadata)).status).toBe(200);
	});
});

describe('atSignInConfigured and atSignInOffered', () => {
	const publicOnly: Record<string, unknown> = { ...key };
	delete publicOnly.d;
	const rows: [string, Partial<Env>, boolean][] = [
		['https and a P-256 private key', { APP_URL: appUrl, ATPROTO_CLIENT_KEY: keyJson }, true],
		['no key', { APP_URL: appUrl }, false],
		['a key that is not JSON', { APP_URL: appUrl, ATPROTO_CLIENT_KEY: '{' }, false],
		[
			'a public key without d',
			{ APP_URL: appUrl, ATPROTO_CLIENT_KEY: JSON.stringify(publicOnly) },
			false
		],
		[
			'a key on another curve',
			{ APP_URL: appUrl, ATPROTO_CLIENT_KEY: JSON.stringify({ ...key, crv: 'P-384' }) },
			false
		],
		[
			'a key without a kid',
			{ APP_URL: appUrl, ATPROTO_CLIENT_KEY: JSON.stringify({ ...key, kid: undefined }) },
			false
		],
		[
			'http on a public host',
			{ APP_URL: 'http://chat.example.com', ATPROTO_CLIENT_KEY: keyJson },
			false
		],
		['no APP_URL', { ATPROTO_CLIENT_KEY: keyJson }, false],
		['an APP_URL that is not a URL', { APP_URL: 'chat', ATPROTO_CLIENT_KEY: keyJson }, false],
		['http on 127.0.0.1, no key', { APP_URL: 'http://127.0.0.1:5173' }, true],
		['http on localhost, no key', { APP_URL: 'http://localhost:5173' }, true]
	];

	it.each(rows)('configured with %s: %s', async (_name, vars, configured) => {
		const env = await orgEnv(vars);
		expect(atSignInConfigured(env)).toBe(configured);
		expect(await atSignInOffered(env)).toBe(false);
		await db(env).update(schema.org).set({ atSignIn: true });
		expect(await atSignInOffered(env)).toBe(configured);
	});
});

describe('loopback mode', () => {
	it('is the AT Protocol loopback client: no key, no auth, no documents', async () => {
		const env = await orgEnv({ APP_URL: 'http://localhost:5173' });
		const client = await atClient(env);
		expect(client.metadata).toMatchObject({
			client_id: 'http://localhost?redirect_uri=http%3A%2F%2F127.0.0.1%3A5173%2Foauth%2Fcallback',
			redirect_uris: ['http://127.0.0.1:5173/oauth/callback'],
			scope: 'atproto',
			token_endpoint_auth_method: 'none'
		});
		expect(client.keyset).toBeUndefined();
	});

	it('is never chosen for an https APP_URL, even on 127.0.0.1 or localhost', async () => {
		for (const host of ['127.0.0.1', 'localhost']) {
			const env = await orgEnv({ APP_URL: `https://${host}:5173` });
			expect(atSignInConfigured(env)).toBe(false);
			await expect(atClient(env)).rejects.toThrow(/Expected an https APP_URL/);
			const withKey = await orgEnv({
				APP_URL: `https://${host}:5173`,
				ATPROTO_CLIENT_KEY: keyJson
			});
			// With a key it is a confidential client, and the library refuses its loopback host.
			await expect(atClient(withKey)).rejects.toThrow(/loopback host/);
		}
	});
});

// A PDS and an authorization server that answer from memory.
const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const otherDid = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';
const issuer = 'https://as.test';

const asMetadata = (iss: string) => ({
	issuer: iss,
	authorization_endpoint: `${iss}/authorize`,
	token_endpoint: `${iss}/token`,
	pushed_authorization_request_endpoint: `${iss}/par`,
	require_pushed_authorization_requests: true,
	response_types_supported: ['code'],
	grant_types_supported: ['authorization_code', 'refresh_token'],
	code_challenge_methods_supported: ['S256'],
	token_endpoint_auth_methods_supported: ['private_key_jwt', 'none'],
	token_endpoint_auth_signing_alg_values_supported: ['ES256'],
	dpop_signing_alg_values_supported: ['ES256'],
	scopes_supported: ['atproto'],
	authorization_response_iss_parameter_supported: true,
	client_id_metadata_document_supported: true
});

const decode = (jwt: string) => {
	const [header, payload] = jwt.split('.');
	const parse = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());
	return { header: parse(header), payload: parse(payload) };
};

function mockWorld(tokenSub = did, { parNonce = '' } = {}) {
	const requests: { url: string; headers: Headers; form: URLSearchParams }[] = [];
	const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json', ...headers }
		});
	const pdsDoc = (id: string, pds: string) => ({
		id,
		service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: pds }]
	});
	const fetch: typeof globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		const url = decodeURIComponent(request.url);
		const form = new URLSearchParams(await request.text());
		requests.push({ url, headers: request.headers, form });
		if (url === `https://plc.directory/${did}`) return json(pdsDoc(did, 'https://pds.test'));
		if (url === `https://plc.directory/${otherDid}`)
			return json(pdsDoc(otherDid, 'https://pds2.test'));
		if (url === 'https://pds.test/.well-known/oauth-protected-resource')
			return json({ resource: 'https://pds.test', authorization_servers: [issuer] });
		if (url === 'https://pds2.test/.well-known/oauth-protected-resource')
			return json({ resource: 'https://pds2.test', authorization_servers: ['https://as2.test'] });
		if (url === `${issuer}/.well-known/oauth-authorization-server`) return json(asMetadata(issuer));
		if (url === 'https://as2.test/.well-known/oauth-authorization-server')
			return json(asMetadata('https://as2.test'));
		if (url === `${issuer}/par` && parNonce && !decode(request.headers.get('dpop')!).payload.nonce)
			return json({ error: 'use_dpop_nonce' }, 400, { 'DPoP-Nonce': parNonce });
		if (url === `${issuer}/par`) return json({ request_uri: 'urn:par:1', expires_in: 60 }, 201);
		if (url === `${issuer}/token`)
			return json({
				access_token: 'at',
				token_type: 'DPoP',
				refresh_token: 'rt',
				expires_in: 3600,
				scope: 'atproto',
				sub: tokenSub
			});
		return new Response('no such mock', { status: 404 });
	};
	return { fetch, requests };
}

async function startSignIn() {
	const env = await orgEnv({ APP_URL: appUrl, ATPROTO_CLIENT_KEY: keyJson });
	const world = mockWorld();
	const client = await atClient(env, world.fetch);
	const { url, stateId } = await client.authorize({ target: { type: 'account', identifier: did } });
	return { client, world, url, stateId };
}

describe('the client against a mocked authorization server', () => {
	it('pushes the request with PKCE S256, a DPoP proof and an assertion signed by the key', async () => {
		const { world, url, stateId } = await startSignIn();
		const par = world.requests.find((r) => r.url === `${issuer}/par`)!;

		expect(par.form.get('code_challenge_method')).toBe('S256');
		expect(par.form.get('code_challenge')).toMatch(/^[\w-]{43}$/);
		expect(par.form.get('scope')).toBe('atproto');
		expect(par.form.get('client_id')).toBe(`${appUrl}/oauth-client-metadata.json`);
		expect(par.form.get('redirect_uri')).toBe(`${appUrl}/oauth/callback`);
		expect(par.form.get('state')).toBe(stateId);

		const dpop = decode(par.headers.get('dpop')!);
		expect(dpop.header).toMatchObject({ typ: 'dpop+jwt', alg: 'ES256' });
		expect(dpop.header.jwk).not.toHaveProperty('d');
		expect(dpop.payload).toMatchObject({ htm: 'POST', htu: `${issuer}/par` });

		expect(par.form.get('client_assertion_type')).toBe(
			'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
		);
		const assertion = par.form.get('client_assertion')!;
		const { header, payload } = decode(assertion);
		expect(header).toMatchObject({ alg: 'ES256', kid: key.kid });
		expect(payload).toMatchObject({
			iss: `${appUrl}/oauth-client-metadata.json`,
			sub: `${appUrl}/oauth-client-metadata.json`,
			aud: issuer
		});
		const [signed, signature] = [
			assertion.slice(0, assertion.lastIndexOf('.')),
			assertion.split('.')[2]
		];
		const publicKey = await webcrypto.subtle.importKey(
			'jwk',
			{ kty: key.kty, crv: key.crv, x: key.x, y: key.y },
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['verify']
		);
		const signedByKey = await webcrypto.subtle.verify(
			{ name: 'ECDSA', hash: 'SHA-256' },
			publicKey,
			Buffer.from(signature, 'base64url'),
			new TextEncoder().encode(signed)
		);
		expect(signedByKey).toBe(true);

		expect(url.href).toBe(
			`${issuer}/authorize?client_id=${encodeURIComponent(`${appUrl}/oauth-client-metadata.json`)}&request_uri=urn%3Apar%3A1`
		);
	});

	it('accepts a callback from the issuer and returns the DID', async () => {
		const { client, stateId } = await startSignIn();
		const { session } = await client.callback(
			new URLSearchParams({ code: 'c', state: stateId, iss: issuer })
		);
		expect(session.did).toBe(did);
	});

	it('refuses a callback with another iss', async () => {
		const { client, stateId } = await startSignIn();
		const params = new URLSearchParams({ code: 'c', state: stateId, iss: 'https://evil.test' });
		await expect(client.callback(params)).rejects.toThrow(/issuer mismatch/);
	});

	it('refuses a callback without iss', async () => {
		const { client, stateId } = await startSignIn();
		await expect(
			client.callback(new URLSearchParams({ code: 'c', state: stateId }))
		).rejects.toThrow(/iss/);
	});

	it('refuses a callback whose state was already used', async () => {
		const { client, stateId } = await startSignIn();
		const params = new URLSearchParams({ code: 'c', state: stateId, iss: issuer });
		await client.callback(params);
		await expect(client.callback(params)).rejects.toThrow(/unknown state/);
	});

	it('refuses a sub whose PDS names another authorization server', async () => {
		const env = await orgEnv({ APP_URL: appUrl, ATPROTO_CLIENT_KEY: keyJson });
		const world = mockWorld(otherDid);
		const client = await atClient(env, world.fetch);
		const { stateId } = await client.authorize({ target: { type: 'account', identifier: did } });
		const params = new URLSearchParams({ code: 'c', state: stateId, iss: issuer });
		await expect(client.callback(params)).rejects.toThrow(
			/issuer mismatch: token issued by https:\/\/as.test, but identity resolves to https:\/\/as2.test/
		);
	});
});

describe('the client with its own fetch', () => {
	afterEach(() => vi.unstubAllGlobals());

	/** Stubs globalThis.fetch with the mocked world and records what reaches it. */
	function stubGlobalFetch(world = mockWorld()) {
		const reached: { url: string; redirect?: RequestRedirect }[] = [];
		vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
			reached.push({ url: new Request(input, init).url, redirect: init?.redirect });
			return world.fetch(input, init);
		});
		return { world, reached };
	}

	it('never lets a refused address reach fetch', async () => {
		const { reached } = stubGlobalFetch();
		const client = await atClient(await orgEnv({ APP_URL: appUrl, ATPROTO_CLIENT_KEY: keyJson }));
		for (const serviceUrl of ['http://pds.test', 'https://10.0.0.1'])
			await expect(client.authorize({ target: { type: 'pds', serviceUrl } })).rejects.toThrow(
				/failed to resolve protected resource metadata/
			);
		expect(reached).toEqual([]);
	});

	it('sends the requests to a public host with redirects handled by the guard', async () => {
		const { reached } = stubGlobalFetch();
		const client = await atClient(await orgEnv({ APP_URL: appUrl, ATPROTO_CLIENT_KEY: keyJson }));
		await client.authorize({ target: { type: 'account', identifier: did } });
		expect(reached.map((r) => new URL(r.url).host)).toEqual([
			'plc.directory',
			'pds.test',
			'as.test',
			'as.test'
		]);
		expect(reached.every((r) => r.redirect === 'manual')).toBe(true);
	});

	it('retries the PAR with the nonce the server asks for', async () => {
		const world = mockWorld(did, { parNonce: 'n-1' });
		stubGlobalFetch(world);
		const client = await atClient(await orgEnv({ APP_URL: appUrl, ATPROTO_CLIENT_KEY: keyJson }));
		await client.authorize({ target: { type: 'account', identifier: did } });
		const nonces = world.requests
			.filter((r) => r.url === `${issuer}/par`)
			.map((r) => decode(r.headers.get('dpop')!).payload.nonce);
		expect(nonces).toEqual([undefined, 'n-1']);
	});
});
