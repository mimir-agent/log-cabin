import { describe, expect, it, vi } from 'vitest';
import type { JobMessage } from '../events';
import { consumeJobs } from '../jobs';
import { commentBody, notificationWorld, signedIn } from '../notifications/testing/world';
import { createPost } from '../posts/posts';
import { loadNote } from './access';
import { createNote, setProjectShare } from './notes';
import { listNoteEvents, recordNoteEvent } from './timeline';

async function deliverAll(w: ReturnType<typeof notificationWorld>) {
	for (const job of w.jobs.splice(0)) {
		const message = { body: { ...job, emittedAt: 1 }, ack: vi.fn(), retry: vi.fn() };
		await consumeJobs({ messages: [message] } as unknown as MessageBatch<JobMessage>, w.env);
		expect(message.retry, 'the job failed; see job_log for the error').not.toHaveBeenCalled();
	}
}

/** Ada's doc "Plan", and the channel Trail that Ada and Bo are in. */
async function world() {
	const w = notificationWorld();
	w.person('ada');
	w.person('bo');
	w.project('trail', 'ada', { members: ['ada', 'bo'] });
	const ada = signedIn('ada');
	const noteId = await createNote(w.env, ada, { title: 'Plan', ...commentBody('The plan') });
	w.jobs.length = 0;
	return { ...w, ada, noteId };
}

describe('sharing a doc with a channel, and as a post', () => {
	it('puts the doc in the channel without a post or a notification', async () => {
		const w = await world();
		const note = await loadNote(w.env, w.ada, w.noteId);
		await setProjectShare(w.env, w.ada, note, { projectId: 'trail', permission: 'view' });
		await deliverAll(w);
		expect(w.sqlite.prepare('SELECT count(*) AS n FROM posts').get()).toEqual({ n: 0 });
		expect(w.notificationsFor('bo')).toEqual([]);
	});

	it('notifies the channel of the post, which is Ada’s, and adds one line to the doc’s timeline', async () => {
		const w = await world();
		const link = { type: 'link', attrs: { href: `https://log.example/notes/${w.noteId}` } };
		const card = { type: 'text', text: 'Plan', marks: [link] };
		const postId = await createPost(w.env, w.ada, 'trail', {
			title: 'The plan is out',
			body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [card] }] }),
			bodyText: '',
			mentions: []
		});
		await recordNoteEvent(w.env, w.noteId, 'ada', {
			kind: 'posted',
			projectId: 'trail',
			refType: 'post',
			refId: postId
		});
		await deliverAll(w);
		expect(w.notificationsFor('bo')).toEqual([
			{ kind: 'post', actor_id: 'ada', item_key: `post:${postId}`, url: `/posts/${postId}` }
		]);
		const lines = (await listNoteEvents(w.env, w.ada, w.noteId)).map(
			(e) => `${e.actorName} ${e.kind}`
		);
		expect(lines, 'the post’s own reference is folded into the posted line').toEqual([
			'ada posted'
		]);
	});
});
