import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { newId } from '#lib/server/id.js';
import { loadProject } from '#lib/server/posts/access.js';
import { createPost, parseBody, type BodyInput } from '#lib/server/posts/posts.js';
import { addProjectMember } from '#lib/server/posts/projects.js';
import { postWorld, routeEvent, textDoc } from '#lib/server/testing/post-world.js';
import { actions, load } from './+page.server';

type PostEvent = Parameters<typeof actions.pin>[0];
type PostData = Exclude<Awaited<ReturnType<typeof load>>, void>;
type Comment = PostData['comments'][number];

const postEvent = (who: SignedIn, postId: string, fields: Record<string, string> = {}) =>
	routeEvent(who, `/posts/${postId}`, { id: postId }, fields) as unknown as PostEvent;

/** A post whose body is one uploaded image, plus a PDF in the same project. */
async function imageWorld() {
	const w = await postWorld();
	const file = (contentType: string) => {
		const id = newId();
		w.sqlite
			.prepare(
				'INSERT INTO attachments (id, project_id, uploaded_by, name, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, 1, 0)'
			)
			.run(id, w.projectId, w.author.user.id, 'file', contentType);
		return id;
	};
	const imageId = file('image/png');
	const pdfId = file('application/pdf');
	const body = JSON.stringify({
		type: 'doc',
		content: [
			{ type: 'image', attrs: { src: `/files/attachments/${imageId}`, alt: 'Tent' } },
			{
				type: 'attachment',
				attrs: { id: pdfId, name: 'plan.pdf', size: 1, contentType: 'application/pdf' }
			}
		]
	});
	const postId = await createPost(w.env, w.author, w.projectId, {
		title: 'Sketch',
		...(parseBody(body) as BodyInput)
	});
	const pin = (who: SignedIn, fields: Record<string, string>) =>
		actions.pin(postEvent(who, postId, { body: textDoc('Move this'), ...fields }));
	const comments = async (who: SignedIn) =>
		((await load(postEvent(who, postId) as never)) as PostData).comments;
	return { ...w, postId, imageId, pdfId, pin, comments };
}

const pinOf = ({ attachmentId, x, y }: Comment) => ({ attachmentId, x, y });

async function status(result: unknown) {
	const e = await Promise.resolve(result).then(
		() => null,
		(e: unknown) => e
	);
	return isHttpError(e) ? e.status : e;
}

describe('comments pinned to a point on an image', () => {
	it('shows everyone who can see the post the comment at its point, with replies under it', async () => {
		const { person, postId, imageId, pin, comments } = await imageWorld();
		const bo = await person('Bo');
		const cy = await person('Cy');
		await pin(bo, { attachmentId: imageId, x: '0.25', y: '0.75' });

		const [pinned] = await comments(cy);
		expect(pinOf(pinned), 'Cy sees the pin where Bo put it').toEqual({
			attachmentId: imageId,
			x: 0.25,
			y: 0.75
		});

		await actions.comment(
			postEvent(cy, postId, { body: textDoc('Agreed'), replyTo: pinned.id, id: newId() })
		);
		const [thread] = await comments(bo);
		expect(thread.replies.map((r: Comment) => ({ name: r.authorName, ...pinOf(r) }))).toEqual([
			{ name: 'Cy', attachmentId: null, x: null, y: null }
		]);
	});

	it('follows the image’s project: a guest outside it can’t see or pin, one added to it can', async () => {
		const { env, author, person, projectId, imageId, pin, comments } = await imageWorld();
		const guest = await person('Gus', 'guest');
		await pin(author, { attachmentId: imageId, x: '0.5', y: '0.5' });

		expect(await status(comments(guest)), 'the post, pins included, is hidden').toBe(404);
		expect(await status(pin(guest, { attachmentId: imageId, x: '0.1', y: '0.1' }))).toBe(404);

		await addProjectMember(env, author, await loadProject(env, author, projectId), guest.user.id);
		await pin(guest, { attachmentId: imageId, x: '0.1', y: '0.2' });
		expect((await comments(guest)).map(pinOf)).toEqual([
			{ attachmentId: imageId, x: 0.5, y: 0.5 },
			{ attachmentId: imageId, x: 0.1, y: 0.2 }
		]);
	});

	it('refuses a viewer, who can read but not comment', async () => {
		const { person, imageId, pin } = await imageWorld();
		const viewer = await person('Vic', 'viewer');
		expect(await status(pin(viewer, { attachmentId: imageId, x: '0.5', y: '0.5' }))).toBe(403);
	});

	it('refuses a point off the image, a file that isn’t an image, and an image from elsewhere', async () => {
		const { author, imageId, pdfId, pin, comments } = await imageWorld();
		const other = newId();
		for (const fields of [
			{ attachmentId: imageId, x: '1.5', y: '0.5' },
			{ attachmentId: imageId, x: '-0.1', y: '0.5' },
			{ attachmentId: imageId, x: 'left', y: '0.5' },
			{ attachmentId: pdfId, x: '0.5', y: '0.5' },
			{ attachmentId: other, x: '0.5', y: '0.5' }
		]) {
			expect(await status(pin(author, fields)), JSON.stringify(fields)).toBe(400);
		}
		expect(await comments(author)).toEqual([]);
	});
});
