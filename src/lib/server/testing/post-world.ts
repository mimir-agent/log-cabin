import { vi } from 'vitest';
import type { SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import { upsertDevMember } from '../dev-login';
import type { JobMessage } from '../events';
import { consumeJobs } from '../jobs';
import { suggestUsername } from '../people/usernames';
import { createPost, parseBody, type BodyInput } from '../posts/posts';
import { createProject } from '../posts/projects';
import { fakeD1 } from './fake-d1';
import { useTestEnv } from './env';

/** A one-paragraph document as the editor posts it. */
export function textDoc(text: string) {
	return JSON.stringify({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});
}

/**
 * An org with Ada (a member) and her post "Plan" in the public project "Launch", on the real
 * migrations. Emitted jobs queue up until deliverJobs() runs them through the JOBS consumer.
 */
export async function postWorld() {
	const { DB, sqlite } = fakeD1();
	sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Campfire', 0)");
	const jobs: JobMessage[] = [];
	const env = {
		DB,
		JOBS: { send: async (message: JobMessage) => void jobs.push(message) },
		REALTIME: {
			idFromName: (topic: string) => topic,
			get: () => ({ fetch: async () => new Response('{}') })
		},
		BUCKET: {},
		EMAIL_TRANSPORT: 'log',
		EMAIL_FROM: 'Campfire <campfire@example.com>',
		APP_URL: 'https://campfire.test'
	} as unknown as Env;
	useTestEnv(env);

	const person = async (name: string, role: Role = 'member'): Promise<SignedIn> => {
		const email = `${name.toLowerCase()}@example.com`;
		const id = await upsertDevMember(env, { email, name, role });
		return {
			user: { id, name, username: suggestUsername(name), email, avatarUrl: null, theme: 'system' },
			member: { id: `m-${id}`, role }
		};
	};

	/** Runs every queued job through the consumer, failing the test if any job fails. */
	async function deliverJobs() {
		const messages = jobs.splice(0).map((body) => ({ body, ack: vi.fn(), retry: vi.fn() }));
		await consumeJobs({ messages } as unknown as MessageBatch<JobMessage>, env);
		const failed = sqlite.prepare("SELECT kind, error FROM job_log WHERE status = 'failed'").all();
		if (failed.length) throw new Error(`jobs failed: ${JSON.stringify(failed)}`);
	}

	const author = await person('Ada');
	const projectId = await createProject(env, author, {
		name: 'Launch',
		description: '',
		private: false
	});
	const postId = await createPost(env, author, projectId, {
		title: 'Plan',
		...(parseBody(textDoc('The plan')) as BodyInput)
	});
	return { env, sqlite, jobs, person, deliverJobs, author, projectId, postId };
}

/** The fields of a SvelteKit request event that routes here read. */
export function routeEvent(
	who: SignedIn,
	path: string,
	params: Record<string, string>,
	fields: Record<string, string | string[]> = {}
) {
	const url = new URL(`https://campfire.test${path}`);
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		for (const v of [value].flat()) body.append(key, v);
	}
	return {
		request: new Request(url, { method: 'POST', body }),
		params,
		locals: { user: who.user, member: who.member },
		url
	};
}
