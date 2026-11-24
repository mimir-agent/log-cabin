import type { DatabaseSync } from 'node:sqlite';
import { vi } from 'vitest';
import type { SignedIn } from '../../auth/session';
import type { Role } from '../../db/schema';
import type { JobMessage } from '../../events';
import type { BodyInput } from '../../posts/posts';
import { fakeD1 } from '../../testing/fake-d1';
import { useTestEnv } from '../../testing/env';

export type Published = { topic: string; payload: unknown };

/**
 * An env for notification tests: the real migrations, a JOBS binding that keeps what is
 * emitted in `jobs`, and a REALTIME binding that records what is published instead of
 * delivering it.
 */
export function notificationWorld(vars: Partial<Env> = {}) {
	const { DB, sqlite } = fakeD1();
	sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Log Cabin', 0)");
	const published: Published[] = [];
	const jobs: JobMessage[] = [];
	const REALTIME = {
		idFromName: (name: string) => name,
		get: () => ({
			fetch: vi.fn(async (_url: string, init: RequestInit) => {
				published.push(JSON.parse(init.body as string));
				return new Response('{}');
			})
		})
	};
	const env = {
		EMAIL_TRANSPORT: 'log',
		EMAIL_FROM: 'Log Cabin <campfire@example.com>',
		APP_URL: 'https://campfire.test',
		JOBS: { send: async (message: JobMessage) => void jobs.push(message) },
		...vars,
		DB,
		REALTIME
	} as unknown as Env;
	useTestEnv(env);
	return { env, sqlite, published, jobs, ...seeders(sqlite) };
}

/** A member as their session shows them, for calling a module's functions as them. */
export function signedIn(id: string): SignedIn {
	return {
		user: {
			id,
			name: id,
			username: `u-${id}`,
			email: `${id}@example.com`,
			avatarUrl: null,
			theme: 'system'
		},
		member: { id: `m-${id}`, role: 'member' }
	};
}

/** A comment's body: a paragraph of text, then a mention of each person named. */
export function commentBody(text: string, mentions: string[] = []): BodyInput {
	const content = [
		{ type: 'text', text },
		...mentions.map((id) => ({ type: 'mention', attrs: { id, label: id } }))
	];
	return {
		body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content }] }),
		bodyText: text,
		mentions
	};
}

function seeders(sqlite: DatabaseSync) {
	return {
		person(
			id: string,
			role: Role = 'member',
			extra: { deactivated?: boolean; timezone?: string } = {}
		) {
			sqlite
				.prepare(
					'INSERT INTO users (id, email, name, username, timezone, created_at) VALUES (?, ?, ?, ?, ?, 0)'
				)
				.run(id, `${id}@example.com`, id, `u-${id.toLowerCase()}`, extra.timezone ?? 'UTC');
			sqlite
				.prepare(
					'INSERT INTO members (id, user_id, role, deactivated_at, created_at) VALUES (?, ?, ?, ?, 0)'
				)
				.run(`m-${id}`, id, role, extra.deactivated ? 1 : null);
		},
		project(
			id: string,
			createdBy: string,
			{ private: isPrivate = false, members = [] as string[], favorites = [] as string[] } = {}
		) {
			sqlite
				.prepare(
					'INSERT INTO projects (id, name, private, created_by, created_at) VALUES (?, ?, ?, ?, 0)'
				)
				.run(id, id, isPrivate ? 1 : 0, createdBy);
			for (const userId of members) {
				sqlite.prepare('INSERT INTO project_members VALUES (?, ?, 0)').run(id, userId);
			}
			for (const userId of favorites) {
				sqlite.prepare('INSERT INTO project_favorites VALUES (?, ?, 0)').run(id, userId);
			}
		},
		post(id: string, projectId: string, authorId: string) {
			sqlite
				.prepare(
					"INSERT INTO posts (id, project_id, author_id, title, body, body_text, created_at, last_activity_at) VALUES (?, ?, ?, 'T', '{}', '', 0, 0)"
				)
				.run(id, projectId, authorId);
		},
		comment(id: string, postId: string, authorId: string, parentId: string | null = null) {
			sqlite
				.prepare(
					"INSERT INTO comments (id, post_id, parent_id, author_id, body, body_text, created_at) VALUES (?, ?, ?, ?, '{}', '', 0)"
				)
				.run(id, postId, parentId, authorId);
		},
		note(id: string, authorId: string, sharedWith: string[] = []) {
			sqlite
				.prepare(
					"INSERT INTO notes (id, author_id, title, body, body_text, created_at, updated_at, updated_by) VALUES (?, ?, 'N', '{}', '', 0, 0, ?)"
				)
				.run(id, authorId, authorId);
			for (const userId of sharedWith) {
				sqlite.prepare("INSERT INTO note_shares VALUES (?, ?, 'view', 0)").run(id, userId);
			}
		},
		/** A chat thread with these people in it: a named group with a title, else a direct message. */
		thread(id: string, people: string[], title?: string) {
			sqlite
				.prepare(
					'INSERT INTO chat_threads (id, title, dm_key, created_by, created_at, last_message_at) VALUES (?, ?, ?, ?, 0, 0)'
				)
				.run(id, title ?? null, title ? null : [...people].sort().join(','), people[0]);
			for (const userId of people) {
				sqlite
					.prepare(
						'INSERT INTO chat_thread_members (thread_id, user_id, last_read_at, created_at) VALUES (?, ?, 0, 0)'
					)
					.run(id, userId);
			}
		},
		/** A message in a thread; `body` is its document, plain text by default. */
		message(id: string, threadId: string, authorId: string, body?: unknown, replyToId?: string) {
			const doc = body ?? {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }]
			};
			sqlite
				.prepare(
					"INSERT INTO messages (id, thread_id, author_id, reply_to_id, body, body_text, created_at) VALUES (?, ?, ?, ?, ?, '', 0)"
				)
				.run(id, threadId, authorId, replyToId ?? null, JSON.stringify(doc));
		},
		notificationsFor(userId: string) {
			return sqlite
				.prepare(
					'SELECT kind, actor_id, item_key, url FROM notifications WHERE user_id = ? ORDER BY created_at, id'
				)
				.all(userId);
		}
	};
}
