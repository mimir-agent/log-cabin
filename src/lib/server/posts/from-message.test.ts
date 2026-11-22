import { describe, expect, it } from 'vitest';
import { docAttachments, type DocNode } from '#lib/editor/doc.js';
import { chatWorld, status } from '#lib/server/testing/chat-world.js';
import { sendMessage } from '#lib/server/chat/messages.js';
import { startDm, loadThread } from '#lib/server/chat/threads.js';
import { loadPost } from './posts';
import { readAttachment, storeAttachment } from './attachments';
import { messageSource, postFromMessage } from './from-message';
import { postPreview } from './post-preview';
import { publishPost } from './drafts';

async function cast() {
	const w = await chatWorld();
	const ada = await w.person('Ada', 'member');
	const bo = await w.person('Bo', 'member');
	const cy = await w.person('Cy', 'member');
	// Ada and Bo talk in a DM; Ada posts to a project she shares with Cy, not Bo.
	const threadId = await startDm(w.env, ada, bo.user.id);
	const thread = await loadThread(w.env, ada, threadId);
	const file = await storeAttachment(
		w.env,
		ada,
		{ threadId },
		new File(['plan'], 'plan.pdf', { type: 'application/pdf' })
	);
	const doc: DocNode = {
		type: 'doc',
		content: [
			{ type: 'paragraph', content: [{ type: 'text', text: 'The plan' }] },
			{ type: 'attachment', attrs: file }
		]
	};
	const messageId = await sendMessage(
		w.env,
		ada,
		thread,
		{ body: JSON.stringify(doc), bodyText: 'The plan' },
		null
	);
	const projectId = await w.shareProject(ada, cy);
	const input = {
		title: 'The plan',
		body: JSON.stringify(doc),
		bodyText: 'The plan',
		poll: null,
		mentions: []
	};
	return { ...w, ada, bo, cy, threadId, file, messageId, projectId, input };
}

describe('a post started from a message', () => {
	it('keeps the message’s words and files, copied to the project, and links back to it', async () => {
		const { env, ada, cy, threadId, file, messageId, projectId, input } = await cast();

		const postId = await postFromMessage(env, ada, projectId, messageId, input);

		const post = await loadPost(env, cy, postId);
		expect(post.fromMessageId).toBe(messageId);
		const [copied] = docAttachments(JSON.parse(post.body));
		expect(copied, 'the file is a copy in the project').not.toBe(file.id);
		expect((await readAttachment(env, cy, copied)).row).toMatchObject({ projectId });
		expect(await status(readAttachment(env, cy, file.id))).toBe(404);

		expect(await messageSource(env, ada, post)).toMatchObject({
			href: `/chat/${threadId}#message-${messageId}`,
			name: 'Bo'
		});
		expect(await messageSource(env, cy, post), 'Cy isn’t in the conversation').toBeNull();
	});

	it('can’t be started from a message you can’t read', async () => {
		const { env, cy, messageId, projectId, input } = await cast();

		expect(await status(postFromMessage(env, cy, projectId, messageId, input))).toBe(404);
	});
});

describe('a post shared into a conversation', () => {
	it('shows as a card to those who can read it, and as unavailable, without its title, to others', async () => {
		const { env, ada, bo, cy, projectId, input } = await cast();
		const postId = await publishPost(env, ada, projectId, input, null);
		const url = new URL(`https://camp.example/posts/${postId}`);

		expect(await postPreview(env, cy, url)).toEqual({
			kind: 'post',
			id: postId,
			title: 'The plan',
			project: 'Shared',
			author: 'Ada'
		});
		expect(await postPreview(env, bo, url)).toEqual({ kind: 'unavailable' });
		expect(await postPreview(env, bo, new URL('https://camp.example/posts/nope'))).toBeNull();
	});
});
