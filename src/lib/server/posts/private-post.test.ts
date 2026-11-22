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

/**
 * A private project's post that bo (a member) and gus (a guest) were mentioned in while they
 * were in the project. Then both were taken off it, and the thread went on without them.
 */
async function world() {
	const jobs: JobMessage[] = [];
	const w = notificationWorld({
		JOBS: { send: async (job: JobMessage) => jobs.push(job) }
	} as never);
	const deliverJobs = async () => {
		const messages = jobs.splice(0).map((job) => ({ body: job, ack: vi.fn(), retry: vi.fn() }));
		await consumeJobs({ messages } as unknown as MessageBatch<JobMessage>, w.env);
		for (const message of messages) expect(message.retry, 'a job failed').not.toHaveBeenCalled();
	};
	const [ada, bo, gus] = [
		signedIn('ada', 'member'),
		signedIn('bo', 'member'),
		signedIn('gus', 'guest')
	];
	for (const who of [ada, bo, gus]) w.person(who.user.id, who.member.role);

	const projectId = await createProject(w.env, ada, {
		name: 'Vault',
		description: '',
		private: true
	});
	const project = await loadProject(w.env, ada, projectId);
	await addProjectMember(w.env, ada, project, 'bo');
	await addProjectMember(w.env, ada, project, 'gus');
	const postId = await createPost(w.env, ada, projectId, {
		title: 'Tents',
		...body('Which tents do we buy?', ['bo', 'gus'])
	});
	await deliverJobs();

	await removeProjectMember(w.env, ada, project, 'bo');
	await removeProjectMember(w.env, ada, project, 'gus');
	const post = await loadPost(w.env, ada, postId);
	await createComment(
		w.env,
		ada,
		post,
		body('The green ones, from the lake shop', ['bo', 'gus']),
		null
	);
	await deliverJobs();
	return { ...w, bo, gus, postId };
}

describe('a private post, to a guest and a member who are not in its project', () => {
	it('names nothing of it on their inbox rows, before or after they read them', async () => {
		const w = await world();
		const aboutPost = (rows: Awaited<ReturnType<typeof listInbox>>) =>
			rows.filter((row) => row.itemKey === `post:${w.postId}`);
		for (const who of [w.bo, w.gus]) {
			expect(aboutPost(await listInbox(w.env, who, 'unread'))).toMatchObject([
				{ itemKey: `post:${w.postId}`, postId: null, place: null, preview: null }
			]);
			await markRead(w.env, who.user.id, null);
			expect(aboutPost(await listInbox(w.env, who, 'read'))).toMatchObject([
				{ itemKey: `post:${w.postId}`, postId: null, place: null, preview: null }
			]);
		}
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

	it('sends them no new notification when the thread goes on', async () => {
		const w = await world();
		for (const who of [w.bo, w.gus]) {
			const kinds = w.notificationsFor(who.user.id).map((n) => (n as { kind: string }).kind);
			expect(
				kinds,
				'being added, the post and its mention, from when they were in it; nothing since'
			).toEqual(['added_to_project', 'post', 'mention']);
		}
	});
});
