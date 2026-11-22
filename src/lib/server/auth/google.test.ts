import { describe, expect, it } from 'vitest';
import { identityFromClaims } from './google';

const clientId = 'client-123.apps.googleusercontent.com';
const now = Date.UTC(2026, 10, 18);

const valid = {
	iss: 'https://accounts.google.com',
	aud: clientId,
	exp: now / 1000 + 3600,
	email: 'Ada@Example.com',
	email_verified: true,
	name: 'Ada Lovelace'
};

describe('identityFromClaims', () => {
	it('reads a verified identity from valid claims, lowercasing the email', () => {
		expect(identityFromClaims(valid, clientId, now)).toEqual({
			email: 'ada@example.com',
			emailVerified: true,
			name: 'Ada Lovelace'
		});
		expect(identityFromClaims({ ...valid, iss: 'accounts.google.com' }, clientId, now).email).toBe(
			'ada@example.com'
		);
	});

	it('rejects a token meant for another app, from another issuer, or already expired', () => {
		expect(() => identityFromClaims({ ...valid, aud: 'someone-else' }, clientId, now)).toThrow();
		expect(() =>
			identityFromClaims({ ...valid, iss: 'https://evil.example.com' }, clientId, now)
		).toThrow();
		expect(() => identityFromClaims({ ...valid, exp: now / 1000 - 1 }, clientId, now)).toThrow();
	});

	it('treats an email without email_verified as unverified', () => {
		const claims: Record<string, unknown> = { ...valid };
		delete claims.email_verified;
		expect(identityFromClaims(claims, clientId, now).emailVerified).toBe(false);
	});
});
