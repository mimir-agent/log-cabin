import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent, JobMessage } from '../events';
import { consumeJobs } from '../jobs';
import { notificationWorld } from './testing/world';

async function deliver(env: Env, event: DomainEvent) {
	const message = { body: { ...event, emittedAt: 1 } as JobMessage, ack: vi.fn(), retry: vi.fn() };
	await consumeJobs({ messages: [message] } as unknown as MessageBatch<JobMessage>, env);
	expect(message.retry, 'the job failed; see job_log for the error').not.toHaveBeenCalled();
}

const sentences = (w: ReturnType<typeof notificationWorld>, userId: string) =>
	w.sqlite
		.prepare('SELECT summary, emoji FROM notifications WHERE user_id = ? ORDER BY created_at, id')
		.all(userId);

describe('notification sentences, per recipient', () => {
	it('words a reply to the person it answers, and to a follower of the post, as Campsite does', async () => {
		const w = notificationWorld();
		for (const id of ['ada', 'bo', 'cy']) w.person(id);
		w.project('pr', 'ada');
		w.post('p1', 'pr', 'ada');
		w.comment('c1', 'p1', 'bo');
		w.comment('c2', 'p1', 'cy', 'c1');
		await deliver(w.env, {
			kind: 'comment.created',
			commentId: 'c2',
			subjectId: 'p1',
			authorId: 'cy'
		});
		expect(sentences(w, 'bo')).toEqual([{ summary: 'cy replied to your comment', emoji: null }]);
		expect(sentences(w, 'ada')).toEqual([{ summary: 'cy replied to bo’s comment', emoji: null }]);
	});

	it('says “their comment” when the reply answers its own author’s', async () => {
		const w = notificationWorld();
		for (const id of ['ada', 'bo']) w.person(id);
		w.project('pr', 'ada');
		w.post('p1', 'pr', 'ada');
		w.comment('c1', 'p1', 'bo');
		w.comment('c2', 'p1', 'bo', 'c1');
		await deliver(w.env, {
			kind: 'comment.created',
			commentId: 'c2',
			subjectId: 'p1',
			authorId: 'bo'
		});
		expect(sentences(w, 'ada')).toEqual([{ summary: 'bo replied to their comment', emoji: null }]);
	});

	it('names a thread with no title by its author, and a private channel with its lock', async () => {
		const w = notificationWorld();
		for (const id of ['ada', 'bo']) w.person(id);
		w.project('pr', 'ada', { private: true, members: ['ada', 'bo'] });
		w.post('p1', 'pr', 'ada');
		w.sqlite.prepare("UPDATE posts SET title = '' WHERE id = 'p1'").run();
		w.comment('c1', 'p1', 'bo');
		await deliver(w.env, {
			kind: 'comment.created',
			commentId: 'c1',
			subjectId: 'p1',
			authorId: 'bo'
		});
		await deliver(w.env, { kind: 'post.created', postId: 'p1', projectId: 'pr', authorId: 'ada' });
		expect(sentences(w, 'ada')).toEqual([{ summary: 'bo commented on ada’s thread', emoji: null }]);
		expect(sentences(w, 'bo')).toEqual([{ summary: 'ada started a thread in 🔒 pr', emoji: null }]);
	});

	it('keeps a reaction’s emoji for the row’s badge', async () => {
		const w = notificationWorld();
		for (const id of ['ada', 'bo']) w.person(id);
		w.project('pr', 'ada');
		w.post('p1', 'pr', 'ada');
		w.sqlite.prepare("INSERT INTO reactions VALUES ('r1', 'post', 'p1', 'bo', '🎉', 0)").run();
		await deliver(w.env, {
			kind: 'reaction.created',
			reactionId: 'r1',
			subjectType: 'post',
			subjectId: 'p1',
			authorId: 'bo'
		});
		expect(sentences(w, 'ada')).toEqual([{ summary: 'bo reacted 🎉 to your thread', emoji: '🎉' }]);
	});
});
