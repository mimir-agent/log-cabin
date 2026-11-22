import { describe, expect, it } from 'vitest';
import { encryptPayload, fromBase64Url, toBase64Url, vapidAuthorization } from './webpush';

// RFC 8291, section 5 and appendix A.
const rfc = {
	plaintext: 'When I grow up, I want to be a watermelon',
	asPublic:
		'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
	asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
	uaPublic:
		'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
	salt: 'DGv6ra1nlYgDCS1FRnbzlw',
	auth: 'BTBZMqHH6r4Tts7J_aSIgg',
	body:
		'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
		'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
		'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
};

describe('web push', () => {
	it('encrypts a payload to the exact body in RFC 8291', async () => {
		const body = await encryptPayload(
			new TextEncoder().encode(rfc.plaintext),
			{ p256dh: rfc.uaPublic, auth: rfc.auth },
			{
				salt: fromBase64Url(rfc.salt),
				serverPublic: fromBase64Url(rfc.asPublic),
				serverPrivate: rfc.asPrivate
			}
		);
		expect(toBase64Url(body)).toBe(rfc.body);
	});

	it('signs a VAPID token for the endpoint origin that verifies with the public key', async () => {
		const now = Date.UTC(2026, 10, 18, 12);
		const header = await vapidAuthorization(
			'https://push.example.net/push/abc',
			{ publicKey: rfc.asPublic, privateKey: rfc.asPrivate },
			'mailto:admin@example.com',
			now
		);
		const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
		expect(match, `expected "vapid t=<jwt>, k=<key>", got "${header}"`).not.toBeNull();
		const [, head, claims, signature, k] = match!;
		expect(k).toBe(rfc.asPublic);
		expect(JSON.parse(new TextDecoder().decode(fromBase64Url(claims)))).toEqual({
			aud: 'https://push.example.net',
			exp: now / 1000 + 12 * 60 * 60,
			sub: 'mailto:admin@example.com'
		});
		const point = fromBase64Url(rfc.asPublic);
		const key = await crypto.subtle.importKey(
			'jwk',
			{
				kty: 'EC',
				crv: 'P-256',
				x: toBase64Url(point.slice(1, 33)),
				y: toBase64Url(point.slice(33))
			},
			{ name: 'ECDSA', namedCurve: 'P-256' },
			false,
			['verify']
		);
		const valid = await crypto.subtle.verify(
			{ name: 'ECDSA', hash: 'SHA-256' },
			key,
			fromBase64Url(signature),
			new TextEncoder().encode(`${head}.${claims}`)
		);
		expect(valid).toBe(true);
	});
});
