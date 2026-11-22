import { isHttpError, isRedirect } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from '../../routes/dev/login/+page.server';
import { readSession } from './auth/session';
import { devLoginEnabled } from './dev-login';
import { createOrgAndAdmin } from './setup';
import { fakeEnv } from './testing/fake-d1';

type LoadEvent = Parameters<typeof load>[0];
type ActionEvent = Parameters<typeof actions.default>[0];

function post(env: Env, fields: Record<string, string>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	const cookies = { set: vi.fn() };
	const event = {
		request: new Request('https://campfire.test/dev/login', { method: 'POST', body }),
		cookies
	};
	return { result: Promise.resolve(actions.default(event as unknown as ActionEvent)), cookies };
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('devLoginEnabled', () => {
	it('is on only in a dev build with DEV_LOGIN=1', () => {
		expect(devLoginEnabled(true, '1')).toBe(true);
		expect(devLoginEnabled(false, '1')).toBe(false);
		expect(devLoginEnabled(true, undefined)).toBe(false);
		expect(devLoginEnabled(true, 'true')).toBe(false);
	});
});

describe('/dev/login', () => {
	it('a production build refuses dev login even when DEV_LOGIN=1', async () => {
		vi.stubEnv('DEV', false);
		const env = fakeEnv({ DEV_LOGIN: '1' });
		const loaded = await Promise.resolve(load({} as unknown as LoadEvent)).catch((e: unknown) => e);
		expect(isHttpError(loaded, 404)).toBe(true);
		const posted = await post(env, {
			email: 'a@example.com',
			name: 'A',
			role: 'admin'
		}).result.catch((e: unknown) => e);
		expect(isHttpError(posted, 404)).toBe(true);
	});

	it('a dev build without DEV_LOGIN=1 refuses dev login', async () => {
		vi.stubEnv('DEV', true);
		fakeEnv();
		const loaded = await Promise.resolve(load({} as unknown as LoadEvent)).catch((e: unknown) => e);
		expect(isHttpError(loaded, 404)).toBe(true);
	});

	it('signs in as a new user with the chosen role, then redirects home', async () => {
		vi.stubEnv('DEV', true);
		const env = fakeEnv({ DEV_LOGIN: '1' });
		await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' });
		const { result, cookies } = post(env, { email: 'Bo@Example.com', name: 'Bo', role: 'guest' });
		const e = await result.catch((e: unknown) => e);
		expect(isRedirect(e) && e.location).toBe('/');
		const session = await readSession(env, cookies.set.mock.calls[0][1]);
		expect(session?.user).toMatchObject({ name: 'Bo', email: 'bo@example.com' });
		expect(session?.member.role).toBe('guest');
	});

	it('changes an existing user’s role and reactivates them', async () => {
		vi.stubEnv('DEV', true);
		const env = fakeEnv({ DEV_LOGIN: '1' });
		await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' });
		await env.DB.prepare('UPDATE members SET deactivated_at = 1').run();
		const { result, cookies } = post(env, {
			email: 'ada@example.com',
			name: 'Ada L',
			role: 'viewer'
		});
		await result.catch(() => undefined);
		const session = await readSession(env, cookies.set.mock.calls[0][1]);
		expect(session?.user.name).toBe('Ada L');
		expect(session?.member.role).toBe('viewer');
	});

	it('fails with 400 on a role that isn’t one of the four', async () => {
		vi.stubEnv('DEV', true);
		const env = fakeEnv({ DEV_LOGIN: '1' });
		const failure = await post(env, { email: 'a@example.com', name: 'A', role: 'owner' }).result;
		expect(failure).toMatchObject({ status: 400 });
	});
});
