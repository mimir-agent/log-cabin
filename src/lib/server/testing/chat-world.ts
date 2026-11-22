// A chat test's world: an in-memory D1, a hub that records what's published, a bucket, and
// people of any role.
import { isHttpError } from '@sveltejs/kit';
import type { SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import type { JobMessage } from '../events';
import { upsertDevMember } from '../dev-login';
import { suggestUsername } from '../people/usernames';
import { loadProject } from '../posts/access';
import { addProjectMember, createProject } from '../posts/projects';
import { fakeD1 } from './fake-d1';
import { useTestEnv } from './env';

/** A message body holding this text. */
export function text(value: string) {
	const doc = {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }]
	};
	return { body: JSON.stringify(doc), bodyText: value };
}

export async function chatWorld() {
	// Who the hub reports as looking at a thread; a test pushes ids in.
	const present: string[] = [];
	const { DB, queries } = fakeD1();
	const jobs: JobMessage[] = [];
	const published: { topic: string; payload: { type: string } }[] = [];
	// What the hub was told besides publishing: unsubscribing someone from a topic.
	const hubCalls: { path: string; body: unknown }[] = [];
	const objects = new Map<string, unknown>();
	const env = {
		DB,
		ATTACHMENT_MAX_MB: '1',
		JOBS: { send: async (message: JobMessage) => void jobs.push(message) },
		BUCKET: {
			put: async (key: string, value: unknown) => void objects.set(key, value),
			get: async (key: string) => (objects.has(key) ? { body: objects.get(key) } : null),
			delete: async (key: string) => void objects.delete(key)
		},
		REALTIME: {
			idFromName: (name: string) => name,
			get: () => ({
				fetch: async (url: string, init?: RequestInit) => {
					if (url.includes('/presence')) return Response.json(present);
					const body = JSON.parse(String(init?.body));
					if (url.endsWith('/publish')) published.push(body);
					else hubCalls.push({ path: new URL(url).pathname, body });
					return url.endsWith('/publish')
						? Response.json({ delivered: 0 })
						: new Response(null, { status: 204 });
				}
			})
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
	const shareProject = async (owner: SignedIn, ...others: SignedIn[]) => {
		const id = await createProject(env, owner, { name: 'Shared', description: '', private: true });
		for (const other of others) {
			await addProjectMember(env, owner, await loadProject(env, owner, id), other.user.id);
		}
		return id;
	};
	return { env, queries, jobs, published, hubCalls, objects, present, person, shareProject };
}

/** The HTTP status a call fails with, or 'ok'. */
export async function status(promise: Promise<unknown>): Promise<number | 'ok'> {
	try {
		await promise;
		return 'ok';
	} catch (e) {
		if (isHttpError(e)) return e.status;
		throw e;
	}
}
