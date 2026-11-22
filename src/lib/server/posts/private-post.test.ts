import { describe, expect, it, vi } from 'vitest';
import type { SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import type { JobMessage } from '../events';
import { consumeJobs } from '../jobs';
import { listActivity } from '../notifications/activity';
import { listInbox, markRead } from '../notifications/inbox';
import { notificationWorld } from '../notifications/testing/world';
import { search } from '../search/search';
import { loadProject } from './access';
import { createComment } from './comments';
import { createPost, loadPost } from './posts';
import { addProjectMember, createProject, removeProjectMember } from './projects';

const signedIn = (id: string, role: Role): SignedIn => ({
	user: {
		id,
		name: id,
		username: id,
		email: `${id}@example.com`,
		avatarUrl: null,
		theme: 'system'
	},
	member: { id: `m-${id}`, role }
});

function body(text: string, mentions: string[] = []) {
	const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
	return { body: JSON.stringify(doc), bodyText: text, mentions };
}

type World = Awaited<ReturnType<typeof setup>>;

/**
 * A project of ada's with bo (a member), gus (a guest) and cy (a member who stays). ada's post
 * mentions all three, and bo's comment on it mentions ada, so each of them has an inbox row.
 */
async function setup({ isPrivate = true } = {}) {
	const jobs: JobMessage[] = [];
	const w = notificationWorld({
		JOBS: { send: async (job: JobMessage) => jobs.push(job) }
	} as never);
	const deliverJobs = async () => {
		const messages = jobs.splice(0).map((job) => ({ body: job, ack: vi.fn(), retry: vi.fn() }));
		await consumeJobs({ messages } as unknown as MessageBatch<JobMessage>, w.env);
		for (const message of messages) expect(message.retry, 'a job failed').not.toHaveBeenCalled();
	};
	const [ada, bo, gus, cy] = [
		signedIn('ada', 'member'),
		signedIn('bo', 'member'),
		signedIn('gus', 'guest'),
		signedIn('cy', 'member')
	];
	for (const who of [ada, bo, gus, cy]) w.person(who.user.id, who.member.role);

	const projectId = await createProject(w.env, ada, {
		name: 'Vault',
		description: '',
		private: isPrivate
	});
	const project = await loadProject(w.env, ada, projectId);
	for (const who of [bo, gus, cy]) await addProjectMember(w.env, ada, project, who.user.id);
	const postId = await createPost(w.env, ada, projectId, {
		title: 'Tents',
		...body('Which tents do we buy?', ['bo', 'gus', 'cy'])
	});
	await createComment(w.env, bo, await loadPost(w.env, bo, postId), body('Green?', ['ada']), null);
	await deliverJobs();
	return { ...w, deliverJobs, ada, bo, gus, cy, project, postId };
}

/** ada takes these people off the project, then the thread goes on without them. */
async function takeOff(w: World, ...removed: SignedIn[]) {
	for (const who of removed) await removeProjectMember(w.env, w.ada, w.project, who.user.id);
	const post = await loadPost(w.env, w.ada, w.postId);
	await createComment(
		w.env,
		w.ada,
		post,
		body('The green ones, from the lake shop', ['bo', 'gus']),
		null
	);
	await w.deliverJobs();
}

/** A private project's post that bo and gus were mentioned in, then taken off the project. */
async function world() {
	const w = await setup();
	await takeOff(w, w.bo, w.gus);
	return w;
}

/** The item keys of everything in a person's inbox, unread, read and archived. */
async function itemKeys(w: World, who: SignedIn) {
	const tabs = await Promise.all(
		(['unread', 'read', 'archived'] as const).map((tab) => listInbox(w.env, who, tab))
	);
	return tabs.flat().map((row) => row.itemKey);
}

function insertNotification(w: World, userId: string, itemKey: string, kind: string) {
	w.sqlite
		.prepare(
			"INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, source, created_at) VALUES (?, ?, 'ada', ?, ?, '/', ?, 1)"
		)
		.run(`n-${userId}-${itemKey}`, userId, kind, itemKey, itemKey);
}

describe('a private post, to a guest and a member who are not in its project', () => {
	it('is gone from their inbox, unread, read or archived, and stays for those in the project', async () => {
		const w = await setup();
		for (const who of [w.bo, w.gus]) await markRead(w.env, who.user.id, null);
		await takeOff(w, w.bo, w.gus);
		for (const who of [w.bo, w.gus]) {
			expect(await itemKeys(w, who)).not.toContain(`post:${w.postId}`);
		}
		for (const who of [w.ada, w.cy]) {
			expect(await itemKeys(w, who)).toContain(`post:${w.postId}`);
		}
	});

	it('is gone from their unread inbox the same way before they read it', async () => {
		const w = await world();
		for (const who of [w.bo, w.gus]) {
			expect(await listInbox(w.env, who, 'unread')).toEqual([]);
		}
	});

	it('leaves the rows of the people still in the project alone', async () => {
		const w = await setup();
		const before = w.notificationsFor('cy');
		await takeOff(w, w.bo, w.gus);
		expect(w.notificationsFor('cy')).toEqual(before);
	});

	it('leaves it and its comments out of their activity', async () => {
		const w = await world();
		for (const who of [w.bo, w.gus]) {
			expect(await listActivity(w.env, who)).toEqual([]);
		}
	});

	it('finds neither it nor its comments when they search', async () => {
		const w = await world();
		for (const who of [w.bo, w.gus]) {
			expect(await search(w.env, who, 'tents', { limit: 50 })).toEqual([]);
			expect(await search(w.env, who, 'lake', { limit: 50 })).toEqual([]);
		}
	});

	it('sends them no new notification when the thread goes on, and keeps none from before', async () => {
		const w = await world();
		for (const who of [w.bo, w.gus]) expect(w.notificationsFor(who.user.id)).toEqual([]);
	});

	it('takes their reminders on it and its comments, and publishes their unread count', async () => {
		const w = await setup();
		w.comment('c-remind', w.postId, 'ada');
		for (const [id, type, subject] of [
			['fu-post', 'post', w.postId],
			['fu-comment', 'comment', 'c-remind']
		]) {
			w.sqlite
				.prepare("INSERT INTO follow_ups VALUES (?, 'bo', ?, ?, 'T', '/', 0, 0, 0, 1)")
				.run(id, type, subject);
			insertNotification(w, 'bo', `follow_up:${id}`, 'follow_up');
		}
		await takeOff(w, w.bo);
		expect(w.notificationsFor('bo')).toEqual([]);
		const counts = w.published.filter((p) => p.topic === 'user:bo').map((p) => p.payload);
		expect(counts.at(-1)).toEqual({ type: 'inbox.unread', count: 0 });
	});

	it('takes their feedback and reaction rows, and the reminders on calls they cannot see', async () => {
		const w = await setup();
		w.sqlite
			.prepare("INSERT INTO post_feedback_requests VALUES ('fr1', ?, 'bo', 'ada', 0, NULL, NULL)")
			.run(w.postId);
		insertNotification(w, 'bo', 'feedback:fr1', 'feedback');
		insertNotification(w, 'bo', `reactions:post:${w.postId}`, 'reaction');
		insertNotification(w, 'cy', 'feedback:fr1', 'feedback');
		const call = w.sqlite.prepare(
			"INSERT INTO calls (id, project_id, started_by, started_at, ended_at) VALUES (?, ?, 'ada', 0, 1)"
		);
		for (const id of ['c-hidden', 'c-took']) {
			call.run(id, w.project.id);
			w.sqlite
				.prepare("INSERT INTO follow_ups VALUES (?, 'bo', 'call', ?, 'T', '/', 0, 0, 0, 1)")
				.run(`fu-${id}`, id);
			insertNotification(w, 'bo', `follow_up:fu-${id}`, 'follow_up');
		}
		w.sqlite
			.prepare(
				"INSERT INTO call_participants (id, call_id, user_id, session_id, joined_at) VALUES ('cp', 'c-took', 'bo', 's', 0)"
			)
			.run();
		await takeOff(w, w.bo);
		expect(await itemKeys(w, w.bo)).toEqual(['follow_up:fu-c-took']);
		expect(w.notificationsFor('cy').map((row) => row.item_key)).toContain('feedback:fr1');
	});

	it('takes a note shared with the project, and keeps one shared with them by name', async () => {
		const w = await setup();
		const note = w.sqlite.prepare(
			"INSERT INTO notes (id, author_id, title, body, body_text, project_id, project_permission, created_at, updated_at, updated_by) VALUES (?, 'ada', 'N', '{}', '', ?, 'view', 0, 0, 'ada')"
		);
		for (const id of ['n-project', 'n-named']) {
			note.run(id, w.project.id);
			insertNotification(w, 'bo', `note:${id}`, 'note');
		}
		w.sqlite.prepare("INSERT INTO note_shares VALUES ('n-named', 'bo', 'view', 0)").run();
		await takeOff(w, w.bo);
		expect(await itemKeys(w, w.bo)).toEqual(['note:n-named']);
	});
});

describe('a public project, to a guest and a member who leave it', () => {
	it('keeps the post for the member, who still sees the project, and takes it from the guest', async () => {
		const w = await setup({ isPrivate: false });
		await takeOff(w, w.bo, w.gus);
		expect(await itemKeys(w, w.bo)).toEqual([`post:${w.postId}`]);
		expect(await itemKeys(w, w.gus)).toEqual([]);
	});
});
