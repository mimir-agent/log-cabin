import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent, JobMessage } from '../events';
import { consumeJobs } from '../jobs';
import { notificationWorld } from './testing/world';

async function deliver(env: Env, event: DomainEvent) {
	const message = { body: { ...event, emittedAt: 1 } as JobMessage, ack: vi.fn(), retry: vi.fn() };
	await consumeJobs({ messages: [message] } as unknown as MessageBatch<JobMessage>, env);
	expect(message.retry, 'the job failed; see job_log for the error').not.toHaveBeenCalled();
}

/** ada, bo and cy; bo and ada are in project "pr", cy is outside it, and the project is private. */
function world() {
	const w = notificationWorld();
	for (const id of ['ada', 'bo', 'cy']) w.person(id);
	w.project('pr', 'ada', { private: true, members: ['ada', 'bo'] });
	return w;
}

describe('the body a notification quotes', () => {
	it('quotes a mention after "<actor> mentioned you"', async () => {
		const w = world();
		w.post('p1', 'pr', 'ada', 'Can you look at this?');
		await deliver(w.env, {
			kind: 'mention',
			subjectType: 'post',
			subjectId: 'p1',
			mentionedUserId: 'bo',
			authorId: 'ada'
		});
		expect(w.previewsFor('bo')).toEqual(['ada mentioned you: Can you look at this?']);
	});

	it('quotes a new post to those who follow its project', async () => {
		const w = world();
		w.post('p1', 'pr', 'ada', 'We ship on Friday.');
		await deliver(w.env, { kind: 'post.created', postId: 'p1', projectId: 'pr', authorId: 'ada' });
		expect(w.previewsFor('bo')).toEqual([expect.stringMatching(/^ada .*: We ship on Friday\.$/)]);
	});

	it('quotes a comment to the post’s subscribers', async () => {
		const w = world();
		w.post('p1', 'pr', 'ada');
		w.comment('c1', 'p1', 'bo', null, 'Looks good to me');
		await deliver(w.env, {
			kind: 'comment.created',
			commentId: 'c1',
			subjectId: 'p1',
			authorId: 'bo'
		});
		expect(w.previewsFor('ada')).toEqual(['bo: Looks good to me']);
	});

	it('quotes a message, naming the sender in a group chat', async () => {
		const w = world();
		w.thread('t1', ['ada', 'bo', 'cy'], 'Trail crew');
		w.message('m1', 't1', 'ada', undefined, undefined, 'Lunch?');
		await deliver(w.env, {
			kind: 'message.created',
			messageId: 'm1',
			threadId: 't1',
			authorId: 'ada',
			recipientIds: ['bo']
		});
		expect(w.previewsFor('bo')).toEqual(['ada: Lunch?']);
	});

	it('quotes a direct message without the sender’s name', async () => {
		const w = world();
		w.thread('t1', ['ada', 'bo']);
		w.message('m1', 't1', 'ada', undefined, undefined, 'Lunch?');
		await deliver(w.env, {
			kind: 'message.created',
			messageId: 'm1',
			threadId: 't1',
			authorId: 'ada',
			recipientIds: ['bo']
		});
		expect(w.previewsFor('bo')).toEqual(['Lunch?']);
	});

	it('tells someone who can’t see the private project nothing, and quotes it to no one', async () => {
		const w = world();
		w.post('p1', 'pr', 'ada', 'Private plans');
		await deliver(w.env, {
			kind: 'mention',
			subjectType: 'post',
			subjectId: 'p1',
			mentionedUserId: 'cy',
			authorId: 'ada'
		});
		expect(w.previewsFor('cy')).toEqual([]);
		expect(w.published.filter((p) => p.topic === 'user:cy')).toEqual([]);
	});

	it('tells an open tab the push’s title and body', async () => {
		const w = world();
		w.post('p1', 'pr', 'ada', 'Can you look at this?');
		await deliver(w.env, {
			kind: 'mention',
			subjectType: 'post',
			subjectId: 'p1',
			mentionedUserId: 'bo',
			authorId: 'ada'
		});
		expect(w.published.filter((p) => p.payload.type === 'new-notification')).toEqual([
			{
				topic: 'user:bo',
				payload: {
					type: 'new-notification',
					title: 'ada mentioned you in T',
					body: 'ada mentioned you: Can you look at this?',
					url: '/posts/p1'
				}
			}
		]);
	});
});
