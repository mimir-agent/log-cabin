import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '#lib/server/auth/session.js';
import { createOrgAndAdmin } from '#lib/server/setup.js';
import { fakeEnv } from '#lib/server/testing/fake-d1.js';
import { setTheme } from '#lib/server/people/theme.js';

// The hook caches "org exists" for the module's life, so each test loads a fresh copy,
// and installs the env into that fresh module graph.
async function freshHandle(env: Env) {
	vi.resetModules();
	(await import('#lib/server/testing/env.js')).useTestEnv(env);
	return (await import('./hooks.server')).handle;
}

function request(path: string, cookie?: string) {
	const locals = {} as App.Locals;
	const event = {
		url: new URL(`https://campfire.test${path}`),
		cookies: { get: (name: string) => (name === 'campfire_session' ? cookie : undefined) },
		locals
	};
	const resolve = vi.fn(async () => new Response('page'));
	return { event, resolve, locals };
}

async function run(env: Env, path: string, cookie?: string) {
	const handle = await freshHandle(env);
	const { event, resolve, locals } = request(path, cookie);
	const response = await handle({ event, resolve } as unknown as Parameters<typeof handle>[0]);
	return { response, resolve, locals };
}

describe('first run', () => {
	let env: Env;
	beforeEach(() => {
		env = fakeEnv();
	});

	it('sends every page to /setup until the org exists', async () => {
		const { response, resolve } = await run(env, '/anything');
		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/setup');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('serves /setup and built assets before the org exists', async () => {
		for (const path of ['/setup', '/_app/immutable/start.js', '/favicon.ico', '/robots.txt']) {
			expect((await run(env, path)).resolve).toHaveBeenCalled();
		}
	});

	it('stops redirecting once the org exists', async () => {
		await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' });
		const { response, locals } = await run(env, '/anything');
		expect(await response.text()).toBe('page');
		expect(locals).toEqual({ user: null, member: null });
	});
});

describe('session cookie', () => {
	it('fills locals.user and locals.member from a valid cookie', async () => {
		const env = fakeEnv();
		const userId = await createOrgAndAdmin(env, {
			orgName: 'Acme',
			adminName: 'Ada',
			email: 'ada@example.com'
		});
		const { token } = await createSession(env, userId);
		const { locals } = await run(env, '/', token);
		expect(locals.user).toMatchObject({ id: userId, name: 'Ada' });
		expect(locals.member).toMatchObject({ role: 'admin' });
	});

	it('leaves locals empty for an unknown cookie', async () => {
		const env = fakeEnv();
		await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' });
		const { locals } = await run(env, '/', 'stale-token');
		expect(locals).toEqual({ user: null, member: null });
	});
});

describe('the theme', () => {
	async function page(env: Env, cookie?: string) {
		const handle = await freshHandle(env);
		const { event } = request('/', cookie);
		let html = '';
		const resolve = async (
			_: unknown,
			opts: { transformPageChunk: (c: { html: string }) => string }
		) => {
			html = opts.transformPageChunk({ html: '<html lang="en" %theme%><body>' });
			return new Response(html);
		};
		await handle({ event, resolve } as unknown as Parameters<typeof handle>[0]);
		return html;
	}

	it.each([
		['dark', '<html lang="en"  data-theme="dark"><body>'],
		['light', '<html lang="en"  data-theme="light"><body>'],
		['system', '<html lang="en" ><body>']
	] as const)('a member who chose %s gets it in the first HTML sent', async (choice, html) => {
		const env = fakeEnv();
		const userId = await createOrgAndAdmin(env, {
			orgName: 'Acme',
			adminName: 'Ada',
			email: 'ada@example.com'
		});
		await setTheme(env, userId, choice);
		// A new session, so the theme can only come from the account.
		const { token } = await createSession(env, userId);
		expect(await page(env, token)).toBe(html);
	});

	it('follows the system when nobody is signed in', async () => {
		const env = fakeEnv();
		await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' });
		expect(await page(env)).toBe('<html lang="en" ><body>');
	});
});
