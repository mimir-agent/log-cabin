import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import { upsertDevMember } from '../dev-login';
import { suggestUsername } from '../people/usernames';
import type { JobMessage } from '../events';
import { fakeD1, tableScans } from '../testing/fake-d1';
import { useTestEnv } from '../testing/env';
import { loadProject } from './access';
import { readAttachment, uploadAttachment } from './attachments';
import { createComment, deleteComment, listComments } from './comments';
import { newId } from '../../id';
import {
	addProjectMember,
	createProject,
	joinProject,
	listProjects,
	setProjectArchived,
	sidebarProjects
} from './projects';
import {
	createPost,
	deletePost,
	feed,
	loadPost,
	parseBody,
	resolvePost,
	updatePost,
	type BodyInput
} from './posts';
import { reactionSummaries, toggleReaction } from './reactions';

function world() {
	const { DB, sqlite, queries } = fakeD1();
	const jobs: JobMessage[] = [];
	const published: { topic: string; payload: unknown }[] = [];
	const objects = new Map<string, Blob>();
	const env = {
		DB,
		ATTACHMENT_MAX_MB: '1',
		JOBS: { send: async (message: JobMessage) => void jobs.push(message) },
		REALTIME: {
			idFromName: (name: string) => name,
			get: () => ({
				fetch: async (_url: string, init: RequestInit) => {
					published.push(JSON.parse(init.body as string));
					return new Response(null, { status: 204 });
				}
			})
		},
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
	return { env, sqlite, queries, jobs, published, objects, person };
}

function body(text: string, mentions: { id: string; label: string }[] = []): BodyInput {
	const parsed = parseBody(
		JSON.stringify({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text },
						...mentions.map((attrs) => ({ type: 'mention', attrs }))
					]
				}
			]
		})
	);
	if ('message' in parsed) throw new Error(`test body didn't parse: ${parsed.message}`);
	return parsed;
}

const post = (title: string, text = 'Body') => ({ title, ...body(text), poll: null });

async function httpStatus(promise: Promise<unknown>): Promise<number | 'ok'> {
	try {
		await promise;
		return 'ok';
	} catch (e) {
		if (isHttpError(e)) return e.status;
		throw e;
	}
}

async function team() {
	const w = world();
	const admin = await w.person('Ada', 'admin');
	const member = await w.person('Max', 'member');
	const viewer = await w.person('Vic', 'viewer');
	const guest = await w.person('Gus', 'guest');
	const open = await createProject(w.env, member, {
		name: 'Open',
		description: '',
		private: false
	});
	const secret = await createProject(w.env, admin, {
		name: 'Secret',
		description: '',
		private: true
	});
	return { ...w, admin, member, viewer, guest, open, secret };
}

describe('who can see and write in a project', () => {
	it('keeps a guest out of a project they were not added to, until someone adds them', async () => {
		const { env, member, guest, open } = await team();
		expect(await httpStatus(loadProject(env, guest, open))).toBe(404);
		expect(await httpStatus(createPost(env, guest, open, post('Hi')))).toBe(404);
		expect(await httpStatus(joinProject(env, guest, await loadProject(env, member, open)))).toBe(
			403
		);

		await addProjectMember(env, member, await loadProject(env, member, open), guest.user.id);
		expect(await httpStatus(createPost(env, guest, open, post('Hi')))).toBe('ok');
	});

	it('lets a viewer read a public project but not post, comment or react', async () => {
		const { env, member, viewer, open } = await team();
		const postId = await createPost(env, member, open, post('Plan'));
		const seen = await loadPost(env, viewer, postId);

		expect(await httpStatus(createPost(env, viewer, open, post('Mine')))).toBe(403);
		expect(await httpStatus(createComment(env, viewer, seen, body('Nice'), null))).toBe(403);
		expect(
			await httpStatus(toggleReaction(env, viewer, seen, { type: 'post', id: postId }, '👍'))
		).toBe(403);
	});

	it('hides a private project and its posts from members who were not added', async () => {
		const { env, admin, member, secret } = await team();
		const postId = await createPost(env, admin, secret, post('Hush'));
		expect(await httpStatus(loadPost(env, member, postId))).toBe(404);
		expect((await feed(env, member, {})).items.map((p) => p.title)).not.toContain('Hush');
		expect((await listProjects(env, member, false)).map((p) => p.name)).toEqual(['Open']);
	});

	it('makes an archived project read-only and drops it from the home feed', async () => {
		const { env, member, open } = await team();
		await createPost(env, member, open, post('Old news'));
		await setProjectArchived(env, member, await loadProject(env, member, open), true);
		expect(await httpStatus(createPost(env, member, open, post('More')))).toBe(403);
		expect((await feed(env, member, {})).items).toEqual([]);
		expect((await feed(env, member, { projectId: open })).items).toHaveLength(1);
	});

	it('lists favourites and joined projects for the sidebar', async () => {
		const { env, member, open } = await team();
		expect(await sidebarProjects(env, member)).toEqual({
			favorites: [],
			joined: [{ id: open, name: 'Open', private: false, accessory: null }]
		});
	});
});

describe('attachments', () => {
	const png = () => new File([new Uint8Array([1, 2, 3])], 'chart.png', { type: 'image/png' });

	it('serves a file only to people who can see its project', async () => {
		const { env, admin, member, guest, secret } = await team();
		const { id } = await uploadAttachment(env, admin, secret, png());
		expect((await readAttachment(env, admin, id)).row.name).toBe('chart.png');
		expect(await httpStatus(readAttachment(env, member, id))).toBe(404);
		expect(await httpStatus(readAttachment(env, guest, id))).toBe(404);
	});

	it('refuses file types outside the allowlist and files over ATTACHMENT_MAX_MB', async () => {
		const { env, member, open } = await team();
		const svg = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' });
		const big = new File([new Uint8Array(1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
		expect(await httpStatus(uploadAttachment(env, member, open, svg))).toBe(415);
		expect(await httpStatus(uploadAttachment(env, member, open, big))).toBe(413);
	});

	it('refuses uploads from a viewer', async () => {
		const { env, viewer, open } = await team();
		expect(await httpStatus(uploadAttachment(env, viewer, open, png()))).toBe(403);
	});
});

describe('posts and the feed', () => {
	it('orders the home feed by latest activity and pages through it with a cursor', async () => {
		const { env, member, open } = await team();
		const ids = [];
		for (let i = 0; i < 22; i++) {
			ids.push(await createPost(env, member, open, post(`Post ${i}`), 1000 + i));
		}
		await createComment(env, member, await loadPost(env, member, ids[0]), body('Bump'), null, 5000);

		const first = await feed(env, member, {});
		expect(first.items.map((p) => p.title).slice(0, 2)).toEqual(['Post 0', 'Post 21']);
		expect(first.items).toHaveLength(20);
		const second = await feed(env, member, { cursor: first.next });
		expect(second.items.map((p) => p.title)).toEqual(['Post 2', 'Post 1']);
		expect(second.next).toBeNull();
	});

	it('names the people who answered a post, not its author', async () => {
		const { env, member, admin, open } = await team();
		const id = await createPost(env, member, open, post('Question'), 1000);
		const loaded = await loadPost(env, member, id);
		await createComment(env, admin, loaded, body('First'), null, 2000);
		await createComment(env, member, loaded, body('Mine'), null, 3000);
		await createComment(env, admin, loaded, body('Again'), null, 4000);

		const [item] = (await feed(env, member, {})).items;
		expect(item.commentCount).toBe(3);
		expect(item.answerers.map((p) => p.id)).toEqual([admin.user.id]);
	});

	it('marks an edited post, and lets only its author edit it', async () => {
		const { env, member, admin, open } = await team();
		const id = await createPost(env, member, open, post('Draft'));
		const loaded = await loadPost(env, member, id);
		expect(await httpStatus(updatePost(env, admin, loaded, post('Hijack')))).toBe(403);
		await updatePost(env, member, loaded, post('Final'));
		const after = await loadPost(env, member, id);
		expect(after.title).toBe('Final');
		expect(after.editedAt).not.toBeNull();
	});

	it('lets the author or an admin delete a post, and nobody else', async () => {
		const { env, member, admin, person, open } = await team();
		const other = await person('Oli', 'member');
		const id = await createPost(env, member, open, post('Gone soon'));
		expect(await httpStatus(deletePost(env, other, await loadPost(env, other, id)))).toBe(403);
		await deletePost(env, admin, await loadPost(env, admin, id));
		expect(await httpStatus(loadPost(env, member, id))).toBe(404);
	});

	it('resolves a post with one of its comments', async () => {
		const { env, member, open } = await team();
		const id = await createPost(env, member, open, post('Question'));
		const loaded = await loadPost(env, member, id);
		const answer = await createComment(env, member, loaded, body('Answer'), null);
		await resolvePost(env, member, loaded, answer, null);
		const after = await loadPost(env, member, id);
		expect(after.resolvedCommentId).toBe(answer);
		expect(after.resolvedBy).toBe(member.user.id);
	});
});

describe('comments and reactions', () => {
	it('stores a comment sent again under the same id once, and refuses that id elsewhere', async () => {
		const { env, jobs, published, member, admin, open } = await team();
		const loaded = await loadPost(env, member, await createPost(env, member, open, post('Q')));
		const other = await loadPost(env, member, await createPost(env, member, open, post('R')));
		const id = newId();

		await createComment(env, member, loaded, body('Once'), null, Date.now(), id);
		const told = [published.length, jobs.length];
		expect(await createComment(env, member, loaded, body('Once'), null, Date.now(), id)).toBe(id);
		expect(await listComments(env, loaded.id)).toHaveLength(1);
		expect([published.length, jobs.length], 'nobody is told twice').toEqual(told);
		const asAdmin = await loadPost(env, admin, loaded.id);
		expect(await httpStatus(createComment(env, admin, asAdmin, body('Mine'), null, 1, id))).toBe(
			409
		);
		expect(await httpStatus(createComment(env, member, other, body('Moved'), null, 1, id))).toBe(
			409
		);
	});

	it('threads a reply to a reply under the top-level comment', async () => {
		const { env, member, admin, open } = await team();
		const loaded = await loadPost(env, member, await createPost(env, member, open, post('Q')));
		const top = await createComment(env, member, loaded, body('Top'), null, 1);
		const reply = await createComment(env, admin, loaded, body('Reply'), top, 2);
		const nested = await createComment(env, member, loaded, body('Nested'), reply, 3);

		const thread = await listComments(env, loaded.id);
		expect(thread).toHaveLength(1);
		expect(thread[0].replies.map((r) => r.id)).toEqual([reply, nested]);

		expect(await httpStatus(deleteComment(env, admin, loaded, top))).toBe('ok');
		expect(await listComments(env, loaded.id)).toEqual([]);
	});

	it('toggles a reaction and reports counts and who reacted', async () => {
		const { env, member, admin, open } = await team();
		const id = await createPost(env, member, open, post('Party'));
		const loaded = await loadPost(env, member, id);
		await toggleReaction(env, member, loaded, { type: 'post', id }, '🎉');
		await toggleReaction(env, admin, loaded, { type: 'post', id }, '🎉');
		expect((await reactionSummaries(env, member.user.id, id))[id]).toEqual([
			{ emoji: '🎉', count: 2, names: ['Max', 'Ada'], mine: true }
		]);
		await toggleReaction(env, member, loaded, { type: 'post', id }, '🎉');
		expect((await reactionSummaries(env, member.user.id, id))[id]).toEqual([
			{ emoji: '🎉', count: 1, names: ['Ada'], mine: false }
		]);
		expect(await httpStatus(toggleReaction(env, member, loaded, { type: 'post', id }, 'lol'))).toBe(
			400
		);
	});

	it("reads a post's reactions and its comments' in one query that uses the index", async () => {
		const { env, sqlite, queries, member, admin, open } = await team();
		const loaded = await loadPost(env, member, await createPost(env, member, open, post('Party')));
		const other = await loadPost(env, member, await createPost(env, member, open, post('Other')));
		const top = await createComment(env, member, loaded, body('Top'), null, 1);
		const reply = await createComment(env, admin, loaded, body('Reply'), top, 2);
		const elsewhere = await createComment(env, admin, other, body('Elsewhere'), null, 3);
		await toggleReaction(env, member, loaded, { type: 'post', id: loaded.id }, '🎉');
		await toggleReaction(env, admin, loaded, { type: 'comment', id: reply }, '👍');
		await toggleReaction(env, member, other, { type: 'post', id: other.id }, '👀');
		await toggleReaction(env, member, other, { type: 'comment', id: elsewhere }, '🔥');

		queries.length = 0;
		expect(await reactionSummaries(env, member.user.id, loaded.id)).toEqual({
			[loaded.id]: [{ emoji: '🎉', count: 1, names: ['Max'], mine: true }],
			[reply]: [{ emoji: '👍', count: 1, names: ['Ada'], mine: false }]
		});
		expect(queries).toHaveLength(1);
		expect(tableScans(sqlite, queries[0])).toEqual([]);
	});
});

describe('events and realtime', () => {
	it('emits post, comment, reaction and mention events and publishes to the project and post', async () => {
		const { env, jobs, published, member, admin, guest, open } = await team();
		const mentions = [
			{ id: admin.user.id, label: 'Ada' },
			{ id: guest.user.id, label: 'Gus' }
		];
		const id = await createPost(env, member, open, { title: 'Hey', ...body('Hi ', mentions) });
		const loaded = await loadPost(env, member, id);
		await createComment(env, admin, loaded, body('Yo'), null);
		await toggleReaction(env, admin, loaded, { type: 'post', id }, '👍');

		expect(jobs.map((j) => j.kind)).toEqual([
			'post.created',
			'mention',
			'comment.created',
			'reaction.created'
		]);
		// The guest can't see the project, so they aren't told about the mention.
		expect(jobs[1]).toMatchObject({ mentionedUserId: admin.user.id, subjectType: 'post' });
		expect(published.map((p) => p.topic)).toEqual([
			`project:${open}`,
			`post:${id}`,
			`project:${open}`,
			`post:${id}`
		]);
	});
});

describe('search index', () => {
	it('keeps rows for posts and comments in step with edits and deletes', async () => {
		const { env, sqlite, member, open } = await team();
		const id = await createPost(env, member, open, post('Roadmap', 'quarterly goals'));
		const loaded = await loadPost(env, member, id);
		const commentId = await createComment(env, member, loaded, body('ship it'), null);
		const search = (q: string) =>
			sqlite
				.prepare('SELECT kind, ref_id, project_id FROM search_index WHERE search_index MATCH ?')
				.all(q);

		expect(search('quarterly')).toEqual([{ kind: 'post', ref_id: id, project_id: open }]);
		expect(search('ship')).toEqual([{ kind: 'comment', ref_id: commentId, project_id: open }]);
		await updatePost(env, member, loaded, post('Roadmap', 'yearly goals'));
		expect(search('quarterly')).toEqual([]);
		await deletePost(env, member, await loadPost(env, member, id));
		expect(search('yearly OR ship')).toEqual([]);
	});
});
