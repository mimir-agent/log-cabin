// Web Push in WebCrypto: payload encryption (RFC 8291, aes128gcm per RFC 8188) and the
// VAPID Authorization header (RFC 8292). Keys are base64url: a public key is the 65-byte
// uncompressed P-256 point, a private key is the 32-byte scalar d.

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type VapidKeys = { publicKey: string; privateKey: string };

const encoder = new TextEncoder();

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
	const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
	return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export function toBase64Url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function jwk(publicKey: Uint8Array, d?: string): JsonWebKey {
	if (publicKey.length !== 65 || publicKey[0] !== 4) {
		throw new Error(
			`web push: expected a 65-byte uncompressed P-256 public key, got ${publicKey.length} bytes`
		);
	}
	return {
		kty: 'EC',
		crv: 'P-256',
		x: toBase64Url(publicKey.slice(1, 33)),
		y: toBase64Url(publicKey.slice(33, 65)),
		...(d ? { d } : {})
	};
}

async function hkdf(
	salt: Uint8Array<ArrayBuffer>,
	ikm: Uint8Array<ArrayBuffer>,
	info: Uint8Array<ArrayBuffer>,
	length: number
) {
	const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt, info },
		key,
		length * 8
	);
	return new Uint8Array(bits);
}

/** The server's ECDH key pair for one message. Tests pass fixed ones; sending makes fresh ones. */
export type EncryptionInputs = {
	salt: Uint8Array<ArrayBuffer>;
	serverPublic: Uint8Array<ArrayBuffer>;
	serverPrivate: string;
};

export async function freshEncryptionInputs(): Promise<EncryptionInputs> {
	const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveBits'
	])) as CryptoKeyPair;
	const serverPublic = new Uint8Array(
		(await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer
	);
	const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
	return { salt: crypto.getRandomValues(new Uint8Array(16)), serverPublic, serverPrivate: d! };
}

/** The aes128gcm body for one push message: header, then a single record. */
export async function encryptPayload(
	plaintext: Uint8Array<ArrayBuffer>,
	target: Pick<PushTarget, 'p256dh' | 'auth'>,
	{ salt, serverPublic, serverPrivate }: EncryptionInputs
): Promise<Uint8Array<ArrayBuffer>> {
	const uaPublic = fromBase64Url(target.p256dh);
	const privateKey = await crypto.subtle.importKey(
		'jwk',
		jwk(serverPublic, serverPrivate),
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		['deriveBits']
	);
	const publicKey = await crypto.subtle.importKey(
		'jwk',
		jwk(uaPublic),
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	const ecdhSecret = new Uint8Array(
		await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256)
	);
	const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, serverPublic);
	const ikm = await hkdf(fromBase64Url(target.auth), ecdhSecret, keyInfo, 32);
	const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
	const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

	const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
	// One record, so the padding delimiter is 0x02 (last record) and there is no padding.
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv: nonce },
			key,
			concat(plaintext, Uint8Array.of(2))
		)
	);
	const recordSize = 4096;
	const header = concat(
		salt,
		Uint8Array.of(
			recordSize >>> 24,
			(recordSize >>> 16) & 255,
			(recordSize >>> 8) & 255,
			recordSize & 255
		),
		Uint8Array.of(serverPublic.length),
		serverPublic
	);
	return concat(header, ciphertext);
}

/** `vapid t=<JWT>, k=<public key>` for the push service at the endpoint's origin. */
export async function vapidAuthorization(
	endpoint: string,
	keys: VapidKeys,
	subject: string,
	now = Date.now()
): Promise<string> {
	const publicKey = fromBase64Url(keys.publicKey);
	const signingKey = await crypto.subtle.importKey(
		'jwk',
		jwk(publicKey, keys.privateKey),
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);
	const header = toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const claims = toBase64Url(
		encoder.encode(
			JSON.stringify({
				aud: new URL(endpoint).origin,
				exp: Math.floor(now / 1000) + 12 * 60 * 60,
				sub: subject
			})
		)
	);
	const signature = new Uint8Array(
		await crypto.subtle.sign(
			{ name: 'ECDSA', hash: 'SHA-256' },
			signingKey,
			encoder.encode(`${header}.${claims}`)
		)
	);
	return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${keys.publicKey}`;
}

export type PushResult = 'sent' | 'expired';

/**
 * Sends one push message. 404 and 410 mean the subscription is gone ('expired'); any other
 * failure throws with the push service's answer.
 */
export async function sendPush(
	target: PushTarget,
	payload: unknown,
	keys: VapidKeys,
	subject: string
): Promise<PushResult> {
	const body = await encryptPayload(
		encoder.encode(JSON.stringify(payload)),
		target,
		await freshEncryptionInputs()
	);
	const response = await fetch(target.endpoint, {
		method: 'POST',
		headers: {
			authorization: await vapidAuthorization(target.endpoint, keys, subject),
			'content-encoding': 'aes128gcm',
			'content-type': 'application/octet-stream',
			ttl: String(24 * 60 * 60),
			urgency: 'normal'
		},
		body
	});
	if (response.status === 404 || response.status === 410) return 'expired';
	if (!response.ok) {
		const detail = (await response.text()).slice(0, 300);
		throw new Error(
			`web push to ${new URL(target.endpoint).origin}: expected 2xx, got ${response.status}: ${detail}`
		);
	}
	return 'sent';
}
