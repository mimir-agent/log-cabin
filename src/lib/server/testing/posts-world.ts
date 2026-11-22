// A small org for posts tests: an in-memory D1 with every migration, stub queue, hub and
// bucket, and helpers to add people, projects and posts.
import type { SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import { upsertDevMember } from '../dev-login';
import { suggestUsername } from '../people/usernames';
import { fakeD1 } from './fake-d1';
import { useTestEnv } from './env';
import { createPost, parseBody, type BodyInput } from '../posts/posts';
import { loadProject } from '../posts/access';
import { addProjectMember, createProject } from '../posts/projects';

export function doc(text: string) {
	return JSON.stringify({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});
}

/** A bucket that keeps objects in memory, enough for put, get and delete. */
export function memoryBucket() {
	const objects = new Map<string, { bytes: ArrayBuffer; contentType: string }>();
	return {
		objects,
		async put(
			key: string,
			body: ArrayBuffer | Blob,
			options: { httpMetadata: { contentType: string } }
		) {
			const bytes = body instanceof Blob ? await body.arrayBuffer() : body;
			objects.set(key, { bytes, contentType: options.httpMetadata.contentType });
		},
		async get(key: string) {
			const object = objects.get(key);
			if (!object) return null;
			return {
				body: new Blob([object.bytes]).stream(),
				httpMetadata: { contentType: object.contentType }
			};
		},
		async delete(key: string) {
			objects.delete(key);
		}
	};
}

export async function postsWorld() {
	const { DB, sqlite } = fakeD1();
	sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Northwind', 0)");
	const bucket = memoryBucket();
	const env = {
		DB,
		JOBS: { send: async () => {} },
		REALTIME: {
			idFromName: (topic: string) => topic,
			get: () => ({ fetch: async () => new Response(null, { status: 204 }) })
		},
		BUCKET: bucket,
		ATTACHMENT_MAX_MB: '25'
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
	const project = (who: SignedIn, name: string, isPrivate = false) =>
		createProject(env, who, { name, description: '', private: isPrivate });
	const post = async (who: SignedIn, projectId: string, title: string, text = title) =>
		createPost(env, who, projectId, { title, ...(parseBody(doc(text)) as BodyInput) });
	const addTo = async (owner: SignedIn, projectId: string, who: SignedIn) =>
		addProjectMember(env, owner, await loadProject(env, owner, projectId), who.user.id);

	return { env, sqlite, bucket, person, project, post, addTo };
}

/** What a SvelteKit load or action receives, for a signed-in person or nobody. */
export function routeEvent(
	who: SignedIn | null,
	path: string,
	params: Record<string, string>,
	fields?: Record<string, string | Blob>
) {
	const url = new URL(`https://campfire.test${path}`);
	let request = new Request(url);
	if (fields) {
		const body = new FormData();
		for (const [key, value] of Object.entries(fields)) body.set(key, value);
		request = new Request(url, { method: 'POST', body });
	}
	return {
		request,
		params,
		url,
		locals: { user: who?.user ?? null, member: who?.member ?? null },
		// No time-zone cookie: the root layout falls back to its default zone.
		cookies: { get: () => undefined },
		depends: () => {},
		setHeaders: () => {}
	};
}
