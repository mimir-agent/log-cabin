// Time-based one-time passwords (RFC 6238 over RFC 4226): HMAC-SHA-1, 6 digits, 30-second
// steps, the format every authenticator app reads.

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const stepSeconds = 30;

export function base32Encode(bytes: Uint8Array): string {
	let bits = '';
	for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
	let out = '';
	for (let i = 0; i < bits.length; i += 5)
		out += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
	return out;
}

function base32Decode(text: string): Uint8Array<ArrayBuffer> {
	let bits = '';
	for (const char of text.replace(/=+$/, '').toUpperCase()) {
		const value = alphabet.indexOf(char);
		if (value < 0) throw new Error(`base32Decode: "${char}" is not a base32 character`);
		bits += value.toString(2).padStart(5, '0');
	}
	const bytes = new Uint8Array(Math.floor(bits.length / 8));
	for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
	return bytes;
}

/** A new 160-bit secret, base32, as RFC 4226 recommends. */
export function newSecret(): string {
	return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export function stepAt(ms: number): number {
	return Math.floor(ms / 1000 / stepSeconds);
}

/** The 6-digit code for a secret at a given step. */
export async function codeAt(secret: string, step: number): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		base32Decode(secret),
		{ name: 'HMAC', hash: 'SHA-1' },
		false,
		['sign']
	);
	const counter = new DataView(new ArrayBuffer(8));
	counter.setBigUint64(0, BigInt(step));
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter.buffer));
	const offset = mac[mac.length - 1] & 0x0f;
	const value = new DataView(mac.buffer).getUint32(offset) & 0x7fffffff;
	return String(value % 1_000_000).padStart(6, '0');
}

/**
 * The step a code belongs to, allowing one step either side of now for clock drift, or
 * null when it matches none of them.
 */
export async function matchingStep(secret: string, code: string, now: number) {
	const current = stepAt(now);
	for (const step of [current - 1, current, current + 1]) {
		if ((await codeAt(secret, step)) === code) return step;
	}
	return null;
}

/** What an authenticator app scans: otpauth://totp/<issuer>:<account>?… */
export function provisioningUri(secret: string, account: string, issuer: string): string {
	const label = encodeURIComponent(`${issuer}:${account}`);
	const params = new URLSearchParams({
		secret,
		issuer,
		algorithm: 'SHA1',
		digits: '6',
		period: '30'
	});
	return `otpauth://totp/${label}?${params}`;
}
