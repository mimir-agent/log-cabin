import { describe, expect, it } from 'vitest';
import { newId } from '#lib/id.js';
import { listInbox } from '#lib/server/notifications/inbox.js';
import { loadProject } from '#lib/server/posts/access.js';
import { createPost, parseBody, type BodyInput } from '#lib/server/posts/posts.js';
import {
	addProjectMember,
	createProject,
	removeProjectMember
} from '#lib/server/posts/projects.js';
import { postWorld, routeEvent, textDoc } from '#lib/server/testing/post-world.js';
import type { SignedIn } from '#lib/server/auth/session.js';
import { actions, load } from './+page.server';

type PostEvent = Parameters<typeof actions.subscribe>[0];
type PostData = Exclude<Awaited<ReturnType<typeof load>>, void>;

const postEvent = (who: SignedIn, postId: string, fields: Record<string, string> = {}) =>
	routeEvent(who, `/posts/${postId}`, { id: postId }, fields) as unknown as PostEvent;

async function subscriptionWorld() {
	const w = await postWorld();
	const bo = await w.person('Bo');
	const cy = await w.person('Cy');
	const comment = async (who: SignedIn, text: string) => {
		await actions.comment(postEvent(who, w.postId, { body: textDoc(text), id: newId() }));
		await w.deliverJobs();
	};
	const commentsFor = async (who: SignedIn) =>
		(await listInbox(w.env, who, 'unread')).filter((row) => row.kind === 'comment');
	const subscribed = async (who: SignedIn) =>
		((await load(postEvent(who, w.postId) as never)) as PostData).subscribed;
	return { ...w, bo, cy, comment, commentsFor, subscribed };
}

describe('the post’s Notifications switch', () => {
	it('starts on for the author and for everyone who comments, and they hear about new comments', async () => {
		const w = await subscriptionWorld();
		expect(await w.subscribed(w.author)).toBe(true);
		expect(await w.subscribed(w.bo), 'Bo hasn’t commented yet').toBe(false);

		await w.comment(w.bo, 'First');
		expect(await w.subscribed(w.bo)).toBe(true);
		await w.comment(w.cy, 'Second');

		expect(await w.commentsFor(w.author)).toHaveLength(1);
		expect(await w.commentsFor(w.bo), 'Cy’s comment').toHaveLength(1);
		expect(await w.commentsFor(w.cy)).toEqual([]);
	});

	it('turned off, stops new comments reaching the inbox, and stays off after a reload', async () => {
		const w = await subscriptionWorld();
		await actions.unsubscribe(postEvent(w.author, w.postId));
		expect(await w.subscribed(w.author)).toBe(false);
		await w.comment(w.bo, 'Anyone?');
		expect(await w.commentsFor(w.author)).toEqual([]);

		await actions.subscribe(postEvent(w.author, w.postId));
		expect(await w.subscribed(w.author)).toBe(true);
		await w.comment(w.bo, 'Again');
		expect(await w.commentsFor(w.author)).toHaveLength(1);
	});

	it('changes only the subscription of whoever is signed in, whoever the form names', async () => {
		const w = await subscriptionWorld();
		await actions.unsubscribe(postEvent(w.bo, w.postId, { userId: w.author.user.id }));
		expect(await w.subscribed(w.author)).toBe(true);
		await actions.subscribe(postEvent(w.bo, w.postId, { userId: w.cy.user.id }));
		expect(await w.subscribed(w.bo)).toBe(true);
		expect(await w.subscribed(w.cy)).toBe(false);
	});

	it('refuses a guest outside the project, and a member taken off a private one', async () => {
		const w = await subscriptionWorld();
		const guest = await w.person('Dee', 'guest');
		const ops = await createProject(w.env, w.author, {
			name: 'Ops',
			description: '',
			private: true
		});
		await addProjectMember(w.env, w.author, await loadProject(w.env, w.author, ops), w.bo.user.id);
		const secret = await createPost(w.env, w.author, ops, {
			title: 'Budget',
			...(parseBody(textDoc('Numbers')) as BodyInput)
		});
		await removeProjectMember(
			w.env,
			w.author,
			await loadProject(w.env, w.author, ops),
			w.bo.user.id
		);

		for (const [who, postId] of [
			[guest, w.postId],
			[w.bo, secret]
		] as const) {
			const refused = await Promise.resolve(actions.subscribe(postEvent(who, postId))).catch(
				(e: unknown) => e
			);
			expect(refused, `${who.user.name} on ${postId}`).toMatchObject({ status: 404 });
		}
		const rows = w.sqlite
			.prepare('SELECT user_id FROM post_subscriptions WHERE user_id IN (?, ?)')
			.all(guest.user.id, w.bo.user.id);
		expect(rows).toEqual([]);
	});
});
