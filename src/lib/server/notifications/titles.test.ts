import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent, JobMessage } from '../events';
import { consumeJobs } from '../jobs';
import { notificationWorld } from './testing/world';

async function deliver(env: Env, event: DomainEvent) {
	const message = { body: { ...event, emittedAt: 1 } as JobMessage, ack: vi.fn(), retry: vi.fn() };
	await consumeJobs({ messages: [message] } as unknown as MessageBatch<JobMessage>, env);
	expect(message.retry, 'the job failed; see job_log for the error').not.toHaveBeenCalled();
}

const titlesOf = (w: ReturnType<typeof notificationWorld>, userId: string) =>
	w.sqlite.prepare('SELECT title FROM notifications WHERE user_id = ? ORDER BY rowid').all(userId);

describe('what an inbox row names under its line', () => {
	it('names the people in a direct message other than the reader', async () => {
		const w = notificationWorld();
		for (const id of ['Ada', 'Bo', 'Cy', 'Dee']) w.person(id);
		w.thread('dm', ['Ada', 'Bo']);
		w.thread('three', ['Ada', 'Bo', 'Cy']);
		w.thread('four', ['Ada', 'Bo', 'Cy', 'Dee']);
		const message = (threadId: string, messageId: string, recipientIds: string[]) => {
			w.message(messageId, threadId, 'Ada');
			return deliver(w.env, {
				kind: 'message.created',
				messageId,
				threadId,
				authorId: 'Ada',
				recipientIds
			});
		};
		await message('dm', 'm1', ['Bo']);
		await message('three', 'm2', ['Bo', 'Cy']);
		await message('four', 'm3', ['Dee']);

		expect(titlesOf(w, 'Bo')).toEqual([{ title: 'Ada' }, { title: 'Ada and Cy' }]);
		expect(titlesOf(w, 'Cy')).toEqual([{ title: 'Ada and Bo' }]);
		expect(titlesOf(w, 'Dee')).toEqual([{ title: 'Ada and 2 others' }]);
	});

	it('names a group thread by its title', async () => {
		const w = notificationWorld();
		for (const id of ['Ada', 'Bo']) w.person(id);
		w.thread('trip', ['Ada', 'Bo'], 'Trip planning');
		w.message('m1', 'trip', 'Ada');
		await deliver(w.env, {
			kind: 'message.created',
			messageId: 'm1',
			threadId: 'trip',
			authorId: 'Ada',
			recipientIds: ['Bo']
		});
		expect(titlesOf(w, 'Bo')).toEqual([{ title: 'Trip planning' }]);
	});

	it('names the note that was shared, or that mentions you', async () => {
		const w = notificationWorld();
		for (const id of ['Ada', 'Bo']) w.person(id);
		w.note('n1', 'Ada', ['Bo']);
		await deliver(w.env, {
			kind: 'note.shared',
			noteId: 'n1',
			sharedWith: ['Bo'],
			authorId: 'Ada'
		});
		await deliver(w.env, {
			kind: 'mention',
			subjectType: 'note',
			subjectId: 'n1',
			mentionedUserId: 'Bo',
			authorId: 'Ada'
		});
		expect(titlesOf(w, 'Bo')).toEqual([{ title: 'N' }, { title: 'N' }]);
	});
});
