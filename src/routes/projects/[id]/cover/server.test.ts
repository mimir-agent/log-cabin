import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import type { Role } from '#lib/server/db/schema/index.js';
import { upsertDevMember } from '#lib/server/dev-login.js';
import { suggestUsername } from '#lib/server/people/usernames.js';
import { createProject } from '#lib/server/posts/projects.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { GET, POST } from './+server';
import { load } from '../+page.server';

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
				const file = objects.get(key);
				return file && { body: file.stream(), httpMetadata: { contentType: file.type } };
			}
		}
	} as unknown as Env;
	useTestEnv(env);
	const person = async (name: string, role: Role): Promise<SignedIn> => {
		const email = `${name.toLowerCase()}@example.com`;
		const id = await upsertDevMember(env, { email, name, role });
		return {
			user: { id, name, username: suggestUsername(name), email, avatarUrl: null, theme: 'system' },
			member: { id: `m-${id}`, role }
		};
	};
	const owner = await person('Max', 'member');
	const other = await person('Bo', 'member');
	const open = await createProject(env, owner, { name: 'Open', description: '', private: false });
	const hidden = await createProject(env, owner, {
		name: 'Hidden',
		description: '',
		private: true
	});
	return { objects, owner, other, open, hidden };
}

function event(who: SignedIn, projectId: string, init?: RequestInit) {
	const url = new URL(`https://campfire.test/projects/${projectId}/cover`);
	return {
		request: new Request(url, init),
		params: { id: projectId },
		locals: who,
		url,
		depends: () => {}
	} as never;
}

function upload(who: SignedIn, projectId: string, file: File) {
	const body = new FormData();
	body.set('cover', file);
	return event(who, projectId, { method: 'POST', body });
}

async function outcome(run: unknown) {
	try {
		return await run;
	} catch (e) {
		if (isRedirect(e)) return { status: e.status, location: e.location };
		if (isHttpError(e)) return { status: e.status };
		throw e;
	}
}

const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'cover.jpeg', { type: 'image/jpeg' });

describe('a project cover', () => {
	it('is saved to R2 by the project’s creator and served to people who can see the project', async () => {
		const { objects, owner, other, open } = await world();
		expect(await outcome(POST(upload(owner, open, jpeg)))).toEqual({
			status: 303,
			location: `/projects/${open}`
		});
		const [key] = objects.keys();
		expect(key).toMatch(new RegExp(`^project-covers/${open}/`));

		const page = (await load(event(other, open))) as { coverUrl: string | null };
		expect(page.coverUrl).toMatch(new RegExp(`^/projects/${open}/cover\\?v=`));
		const served = (await GET(event(other, open))) as Response;
		expect(served.headers.get('content-type')).toBe('image/jpeg');
		expect(new Uint8Array(await served.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
	});

	it('of a private project isn’t served to someone outside it', async () => {
		const { owner, other, hidden } = await world();
		await outcome(POST(upload(owner, hidden, jpeg)));
		expect(await outcome(GET(event(other, hidden)))).toEqual({ status: 404 });
	});

	it('can only be changed by the creator or an admin', async () => {
		const { objects, other, open } = await world();
		expect(await outcome(POST(upload(other, open, jpeg)))).toEqual({ status: 403 });
		expect(objects.size).toBe(0);
	});

	it('must still be an image of an allowed type, cropped or not', async () => {
		const { objects, owner, open } = await world();
		const text = new File(['hello'], 'cover.txt', { type: 'text/plain' });
		expect(await outcome(POST(upload(owner, open, text)))).toEqual({ status: 400 });
		expect(objects.size).toBe(0);
	});
});
