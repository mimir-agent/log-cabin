import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import type { Role } from '#lib/server/db/schema/index.js';
import { upsertDevMember } from '#lib/server/dev-login.js';
import { suggestUsername } from '#lib/server/people/usernames.js';
import { createProject } from '#lib/server/posts/projects.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { POST } from './+server';

async function world() {
	const { DB } = fakeD1();
	const objects = new Map<string, Blob>();
	const env = {
		DB,
		ATTACHMENT_MAX_MB: '1',
		BUCKET: { put: async (key: string, body: Blob) => void objects.set(key, body) }
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
	const member = await person('Max', 'member');
	const viewer = await person('Vic', 'viewer');
	const projectId = await createProject(env, member, {
		name: 'Open',
		description: '',
		private: false
	});
	return { objects, member, viewer, projectId };
}

function upload(who: SignedIn, projectId: string, file: File) {
	const url = new URL(`https://campfire.test/projects/${projectId}/attachments`);
	const body = new FormData();
	body.set('file', file);
	const event = {
		request: new Request(url, { method: 'POST', body }),
		params: { id: projectId },
		locals: who,
		url
	};
	return POST(event as unknown as Parameters<typeof POST>[0]);
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' });

describe('POST /projects/[id]/attachments', () => {
	it('stores a member’s upload and answers 201 with its id', async () => {
		const { objects, member, projectId } = await world();
		const response = await upload(member, projectId, png());
		expect(response.status).toBe(201);
		const body: { id: string } = await response.json();
		expect(body).toMatchObject({ name: 'shot.png', size: 4, contentType: 'image/png' });
		expect(objects.has(`attachments/${body.id}`)).toBe(true);
	});

	it('answers a viewer with 403 and a message the editor can show', async () => {
		const { objects, viewer, projectId } = await world();
		const response = await upload(viewer, projectId, png());
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ message: expect.any(String) });
		expect(objects.size).toBe(0);
	});
});
