// ULID: 10 characters of millisecond time then 16 random, Crockford base32.
// IDs sort by creation time, which keeps feeds and logs cheap to page. Nothing here is
// server-only, so the browser can make them too.
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newId(now = Date.now()): string {
	let time = '';
	for (let i = 0, t = now; i < 10; i++, t = Math.floor(t / 32)) {
		time = alphabet[t % 32] + time;
	}
	const random = crypto.getRandomValues(new Uint8Array(16));
	return time + Array.from(random, (byte) => alphabet[byte % 32]).join('');
}
