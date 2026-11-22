import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import type { Role } from '#lib/server/db/schema/index.js';
import { upsertDevMember } from '#lib/server/dev-login.js';
import { suggestUsername } from '#lib/server/people/usernames.js';
import { uploadAttachment } from '#lib/server/posts/attachments.js';
import { createProject } from '#lib/server/posts/projects.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { GET } from './+server';

async function world() {
	const { DB } = fakeD1();
	const objects = new Map<string, Blob>();
	const env = {
		DB,
		ATTACHMENT_MAX_MB: '1',
		BUCKET: {
			put: async (key: string, body: Blob) => void objects.set(key, body),
			get: async (key: string) => (objects.has(key) ? { body: objects.get(key) } : null)
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
	const admin = await person('Ada', 'admin');
	const member = await person('Max', 'member');
	const secret = await createProject(env, admin, {
		name: 'Secret',
		description: '',
		private: true
	});
	const upload = (file: File) => uploadAttachment(env, admin, secret, file);
	return { admin, member, upload };
}

function download(who: SignedIn, id: string) {
	const url = new URL(`https://campfire.test/files/attachments/${id}`);
	const event = { request: new Request(url), params: { id }, locals: who, url };
	return GET(event as unknown as Parameters<typeof GET>[0]);
}

describe('GET /files/attachments/[id]', () => {
	it('answers 404 to someone who can’t see the file’s project', async () => {
		const { member, upload } = await world();
		const { id } = await upload(new File(['hi'], 'notes.txt', { type: 'text/plain' }));
		await expect(download(member, id)).rejects.toMatchObject({ status: 404 });
	});

	it('serves an image inline, unsniffable and sandboxed', async () => {
		const { admin, upload } = await world();
		const { id } = await upload(
			new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })
		);
		const response = await download(admin, id);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('content-disposition')).toBe('inline');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('content-security-policy')).toBe('sandbox');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
	});

	it('serves anything else as a download under its own name', async () => {
		const { admin, upload } = await world();
		const { id } = await upload(new File(['hi'], "Ada's notes.txt", { type: 'text/plain' }));
		const response = await download(admin, id);
		expect(response.headers.get('content-disposition')).toBe(
			"attachment; filename*=UTF-8''Ada%27s%20notes.txt"
		);
	});
});
