import { describe, expect, it } from 'vitest';
import { attachmentPath, docAttachments, type DocNode } from '#lib/editor/doc.js';
import { chatWorld, status } from '#lib/server/testing/chat-world.js';
import { deletePost, loadPost } from '../posts/posts';
import { publishPost } from '../posts/drafts';
import { readAttachment, storeAttachment } from '../posts/attachments';
import { addProjectMember } from '../posts/projects';
import { loadProject } from '../posts/access';
import { loadNote } from './access';
import { makeDocFromPost } from './from-post';
import { listNoteEvents } from './timeline';

/** Ada's post in a channel Bo and Cy are in, with a picture, and Dee who can't see the channel. */
async function cast() {
	const w = await chatWorld();
	const ada = await w.person('Ada', 'member');
	const bo = await w.person('Bo', 'member');
	const dee = await w.person('Dee', 'member');
	const projectId = await w.shareProject(ada, bo);
	const picture = await storeAttachment(
		w.env,
		ada,
		{ projectId },
		new File(['png bytes'], 'plan.png', { type: 'image/png' })
	);
	const doc: DocNode = {
		type: 'doc',
		content: [
			{ type: 'paragraph', content: [{ type: 'text', text: 'The plan' }] },
			{ type: 'image', attrs: { src: attachmentPath(picture.id), alt: 'plan.png' } }
		]
	};
	const postId = await publishPost(
		w.env,
		ada,
		projectId,
		{
			title: 'Pricing page',
			body: JSON.stringify(doc),
			bodyText: 'The plan',
			poll: null,
			mentions: []
		},
		null
	);
	return { ...w, ada, bo, dee, projectId, picture, postId };
}

describe('a doc made from a post', () => {
	it('is the reader’s own private copy, with the title, the body and its own copy of each picture', async () => {
		const { env, ada, bo, picture, postId, objects } = await cast();
		const post = await loadPost(env, bo, postId);

		const noteId = await makeDocFromPost(env, bo, post);

		const note = await loadNote(env, bo, noteId);
		expect(note).toMatchObject({ title: 'Pricing page', authorId: bo.user.id, projectId: null });
		const [copied] = docAttachments(JSON.parse(note.body));
		expect(copied, 'a file of the doc’s own').not.toBe(picture.id);
		expect(JSON.parse(note.body).content[0]).toEqual(JSON.parse(post.body).content[0]);
		const { row } = await readAttachment(env, bo, copied);
		expect(row).toMatchObject({ noteId, name: 'plan.png', contentType: 'image/png' });
		expect(objects.get(`attachments/${copied}`), 'the same bytes under its own key').toBe(
			objects.get(`attachments/${picture.id}`)
		);
		expect(await status(loadNote(env, ada, noteId)), 'not even the post’s author').toBe(404);
		expect(await status(readAttachment(env, ada, copied))).toBe(404);
		expect((await readAttachment(env, ada, picture.id)).row.id, 'the post’s file stays').toBe(
			picture.id
		);
	});

	it('leaves the post as it was', async () => {
		const { env, bo, postId } = await cast();
		const before = await loadPost(env, bo, postId);

		await makeDocFromPost(env, bo, before);

		expect(await loadPost(env, bo, postId)).toEqual(before);
	});

	it('opens its timeline with a line naming the post, until the post is deleted', async () => {
		const { env, ada, bo, postId } = await cast();
		const noteId = await makeDocFromPost(env, bo, await loadPost(env, bo, postId));

		expect(await listNoteEvents(env, bo, noteId)).toMatchObject([
			{ kind: 'from_post', actorName: 'Bo', post: { id: postId, title: 'Pricing page' } }
		]);

		await deletePost(env, ada, await loadPost(env, ada, postId));

		expect(await listNoteEvents(env, bo, noteId)).toMatchObject([
			{ kind: 'from_post', actorName: 'Bo', post: null }
		]);
	});

	it('can’t be made from a post you can’t read', async () => {
		const { env, dee, postId } = await cast();

		expect(await status(loadPost(env, dee, postId))).toBe(404);
	});

	it('is open to a guest in the channel, as docs are, and refused a viewer', async () => {
		const { env, ada, person, projectId, postId } = await cast();
		const guest = await person('Gus', 'guest');
		const viewer = await person('Vi', 'viewer');
		const project = await loadProject(env, ada, projectId);
		for (const who of [guest, viewer]) await addProjectMember(env, ada, project, who.user.id);

		expect(await makeDocFromPost(env, guest, await loadPost(env, guest, postId))).toBeTruthy();
		expect(await status(makeDocFromPost(env, viewer, await loadPost(env, viewer, postId)))).toBe(
			403
		);
	});
});
