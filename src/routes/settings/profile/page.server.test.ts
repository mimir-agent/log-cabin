import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { createSession, readSession, type SignedIn } from '#lib/server/auth/session.js';
import { createOrgAndAdmin } from '#lib/server/setup.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { actions, load } from './+page.server';
import { GET as file } from '../../files/[...key]/+server';

async function world() {
	const { DB } = fakeD1();
	const objects = new Map<string, File>();
	const env = {
		DB,
		BUCKET: {
			put: async (
				key: string,
				body: ArrayBuffer,
				options: { httpMetadata: { contentType: string } }
			) => void objects.set(key, new File([body], key, { type: options.httpMetadata.contentType })),
			get: async (key: string) => {
				const stored = objects.get(key);
				return stored && { body: stored.stream(), httpMetadata: { contentType: stored.type } };
			}
		}
	} as unknown as Env;
	useTestEnv(env);
	const userId = await createOrgAndAdmin(env, {
		orgName: 'Acme',
		adminName: 'Ada',
		email: 'ada@example.com'
	});
	const ada = (await readSession(env, (await createSession(env, userId)).token))!;
	return { objects, ada };
}

function save(who: SignedIn, fields: Record<string, string | File>) {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) body.set(name, value);
	const request = new Request('https://campfire.test/settings/profile', { method: 'POST', body });
	return actions.saveProfile({ locals: who, url: new URL(request.url), request } as never);
}

function get(who: SignedIn | { user: null; member: null }, path: string) {
	const url = new URL(`https://campfire.test${path}`);
	const key = decodeURIComponent(path.replace(/^\/files\//, ''));
	return file({ locals: who, params: { key }, url, request: new Request(url) } as never);
}

async function outcome(run: unknown) {
	try {
		return await run;
	} catch (e) {
		if (isRedirect(e)) return { status: e.status };
		if (isHttpError(e)) return { status: e.status };
		throw e;
	}
}

const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'cover.jpeg', { type: 'image/jpeg' });

describe('a cover photo', () => {
	it('is uploaded with the profile and served from R2 to signed-in members only', async () => {
		const { objects, ada } = await world();
		expect(await save(ada, { name: 'Ada', username: 'ada', cover: jpeg })).toEqual({ saved: true });
		const [key] = objects.keys();
		expect(key).toMatch(/^covers\//);

		const { profile } = (await load({ locals: ada, url: new URL('https://x/') } as never)) as {
			profile: { coverUrl: string };
		};
		expect(profile.coverUrl).toBe(`/files/${key}`);
		const served = (await get(ada, profile.coverUrl)) as Response;
		expect(served.headers.get('content-type')).toBe('image/jpeg');
		expect(await outcome(get({ user: null, member: null }, profile.coverUrl))).toEqual({
			status: 303
		});
	});

	it('that isn’t an image is refused with a message, and nothing is stored', async () => {
		const { objects, ada } = await world();
		const text = new File(['hi'], 'cover.txt', { type: 'text/plain' });
		expect(await save(ada, { name: 'Ada', username: 'ada', cover: text })).toMatchObject({
			status: 400,
			data: { message: expect.any(String) }
		});
		expect(objects.size).toBe(0);
	});
});

describe('a profile save', () => {
	it('with a refused image changes nothing, the username included', async () => {
		const { ada } = await world();
		const text = new File(['hi'], 'avatar.txt', { type: 'text/plain' });

		const saved = await save(ada, { name: 'Ada L', username: 'ada-l', avatar: text });

		expect(saved).toMatchObject({ status: 400 });
		const { profile } = (await load({ locals: ada, url: new URL('https://x/') } as never)) as {
			profile: { name: string; username: string };
		};
		expect(profile).toMatchObject({ name: 'Ada', username: 'ada' });
	});
});
