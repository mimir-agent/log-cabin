import { isHttpError, isRedirect, type ActionFailure } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { actions, load } from '../../routes/setup/+page.server';
import { consumeSignInToken } from './auth/magic-link';
import { useTestEnv } from './testing/env';
import { fakeD1, fakeEnv } from './testing/fake-d1';
import { assertNoOrg, createOrgAndAdmin, orgExists, validateSetupInput } from './setup';

const valid = { orgName: 'Acme', adminName: 'Ada', email: 'Ada@Example.com ' };

describe('validateSetupInput', () => {
	it('rejects each missing field with a message', () => {
		expect(validateSetupInput({ ...valid, orgName: ' ' }, undefined)).toMatchObject({
			ok: false,
			status: 400
		});
		expect(validateSetupInput({ ...valid, adminName: '' }, undefined)).toMatchObject({
			ok: false
		});
		expect(validateSetupInput({ ...valid, email: 'ada' }, undefined)).toMatchObject({ ok: false });
		expect(validateSetupInput({}, undefined)).toMatchObject({ ok: false });
	});

	it('rejects a wrong or missing token when SETUP_TOKEN is set', () => {
		expect(validateSetupInput({ ...valid, token: 'nope' }, 'secret')).toMatchObject({
			ok: false,
			status: 403
		});
		expect(validateSetupInput(valid, 'secret')).toMatchObject({ ok: false, status: 403 });
		expect(validateSetupInput({ ...valid, token: 'secret' }, 'secret').ok).toBe(true);
	});

	it('accepts the form without a token when SETUP_TOKEN is unset, trimming and lowercasing the email', () => {
		expect(validateSetupInput(valid, undefined)).toEqual({
			ok: true,
			input: { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' }
		});
	});
});

describe('createOrgAndAdmin', () => {
	it('creates the org row, the user and an admin member', async () => {
		const { DB, sqlite } = fakeD1();
		const env = { DB } as Env;
		expect(await orgExists(env)).toBe(false);
		const userId = await createOrgAndAdmin(env, { ...valid, email: 'ada@example.com' });
		expect(await orgExists(env)).toBe(true);
		expect(sqlite.prepare('SELECT id, name FROM org').all()).toEqual([{ id: 1, name: 'Acme' }]);
		expect(sqlite.prepare('SELECT user_id, role FROM members').all()).toEqual([
			{ user_id: userId, role: 'admin' }
		]);
	});

	it('404s once the org exists', async () => {
		const env = fakeEnv();
		await assertNoOrg(env);
		await createOrgAndAdmin(env, { ...valid, email: 'ada@example.com' });
		const e = await assertNoOrg(env).catch((e: unknown) => e);
		expect(isHttpError(e, 404)).toBe(true);
	});
});

function post(env: Env, fields: Record<string, string>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	const cookies = { set: vi.fn() };
	const event = {
		request: new Request('https://campfire.test/setup', { method: 'POST', body }),
		url: new URL('https://campfire.test/setup'),
		getClientAddress: () => '203.0.113.7',
		cookies
	};
	const result = actions.default(event as unknown as Parameters<typeof actions.default>[0]);
	return { result, cookies };
}

describe('/setup', () => {
	it('prefills the token from ?token= and says whether one is needed', async () => {
		fakeEnv({ SETUP_TOKEN: 'secret' });
		const url = new URL('https://campfire.test/setup?token=secret');
		const data = await load({ url } as unknown as Parameters<typeof load>[0]);
		expect(data).toEqual({ tokenRequired: true, token: 'secret' });
	});

	it('creates the org and admin, and emails the admin a sign-in link instead of signing in', async () => {
		const { DB, sqlite } = fakeD1();
		const env = {
			DB,
			EMAIL_TRANSPORT: 'log',
			EMAIL_FROM: 'Log Cabin <campfire@example.com>'
		} as Env;
		useTestEnv(env);
		const { result, cookies } = post(env, valid);
		const e = await Promise.resolve(result).catch((e: unknown) => e);
		expect(isRedirect(e) && e.location).toBe('/login?setup=done');
		expect(cookies.set).not.toHaveBeenCalled();
		const mail = sqlite.prepare('SELECT to_address, text_body FROM dev_mail').all() as {
			to_address: string;
			text_body: string;
		}[];
		expect(mail.map((m) => m.to_address)).toEqual(['ada@example.com']);
		const token = decodeURIComponent(mail[0].text_body.match(/token=([^\s]+)/)?.[1] ?? '');
		expect(await consumeSignInToken(env, token), 'the emailed link should sign Ada in').toBe(
			'ada@example.com'
		);
	});

	it('fails with 403 and keeps the fields when the token is wrong', async () => {
		const env = fakeEnv({ SETUP_TOKEN: 'secret' });
		const failure = (await post(env, { ...valid, token: 'nope' }).result) as ActionFailure<{
			orgName: string;
		}>;
		expect(failure.status).toBe(403);
		expect(failure.data.orgName).toBe('Acme');
		expect(await orgExists(env)).toBe(false);
	});

	it('404s when the org already exists', async () => {
		const env = fakeEnv();
		await createOrgAndAdmin(env, { ...valid, email: 'ada@example.com' });
		const url = new URL('https://campfire.test/setup');
		const e = await Promise.resolve(load({ url } as unknown as Parameters<typeof load>[0])).catch(
			(e: unknown) => e
		);
		expect(isHttpError(e, 404)).toBe(true);
	});
});
