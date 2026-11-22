import { describe, expect, it } from 'vitest';
import { base32Encode, codeAt } from './totp';

describe('authenticator codes', () => {
	it('match RFC 6238’s SHA-1 test vectors, cut to 6 digits', async () => {
		const secret = base32Encode(new TextEncoder().encode('12345678901234567890'));
		// The RFC's 8-digit codes at T = 59, 1111111109 and 2000000000 seconds end in these.
		expect(await codeAt(secret, Math.floor(59 / 30))).toBe('287082');
		expect(await codeAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
		expect(await codeAt(secret, Math.floor(2000000000 / 30))).toBe('279037');
	});
});
