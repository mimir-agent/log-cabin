import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { newId } from '#lib/id.js';
import { listInbox } from '#lib/server/notifications/inbox.js';
import { postWorld, routeEvent, textDoc } from '#lib/server/testing/post-world.js';
import type { SignedIn } from '#lib/server/auth/session.js';
import { actions, load } from './+page.server';
import { actions as inboxActions } from '../../inbox/+page.server';

type PostEvent = Parameters<typeof actions.requestFeedback>[0];
type InboxEvent = Parameters<typeof inboxActions.dismissFeedback>[0];
type PostData = Exclude<Awaited<ReturnType<typeof load>>, void>;
type FeedbackRow = { id: string; name: string; status: string };

const postEvent = (who: SignedIn, postId: string, fields: Record<string, string | string[]> = {}) =>
	routeEvent(who, `/posts/${postId}`, { id: postId }, fields) as unknown as PostEvent;

const inboxEvent = (who: SignedIn, item: string) =>
	routeEvent(who, '/inbox', {}, { item }) as unknown as InboxEvent;

async function askedWorld() {
	const w = await postWorld();
	const bo = await w.person('Bo');
	const cy = await w.person('Cy');
	await actions.requestFeedback(
		postEvent(w.author, w.postId, { person: [bo.user.id, cy.user.id] })
	);
	await w.deliverJobs();
	const statuses = async () => {
		const data = (await load(postEvent(w.author, w.postId) as never)) as PostData;
		return data.feedback.map((r: FeedbackRow) => [r.name, r.status]);
	};
	return { ...w, bo, cy, statuses };
}

describe('feedback requests', () => {
	it('puts an item naming the post in the inbox of each person asked', async () => {
		const { env, bo, cy, postId } = await askedWorld();
		for (const person of [bo, cy]) {
			const inbox = await listInbox(env, person, 'unread');
			expect(inbox, `${person.user.name}'s unread inbox`).toMatchObject([
				{ kind: 'feedback', title: 'Plan', url: `/posts/${postId}`, actorName: 'Ada' }
			]);
		}
	});

	it('shows the author who responded, who dismissed and who hasn’t answered', async () => {
		const { env, bo, cy, postId, statuses } = await askedWorld();
		expect(await statuses()).toEqual([
			['Bo', 'waiting'],
			['Cy', 'waiting']
		]);

		const [item] = await listInbox(env, bo, 'unread');
		await inboxActions.dismissFeedback(inboxEvent(bo, item.itemKey));
		await actions.comment(postEvent(cy, postId, { body: textDoc('Looks good'), id: newId() }));

		expect(await statuses()).toEqual([
			['Bo', 'dismissed'],
			['Cy', 'replied']
		]);
		expect(await listInbox(env, bo, 'unread'), 'dismissing removes the item').toEqual([]);
		expect(await listInbox(env, bo, 'archived')).toMatchObject([{ kind: 'feedback' }]);
	});

	it('lets the person asked dismiss it from the post too', async () => {
		const { env, bo, postId, statuses } = await askedWorld();
		const data = (await load(postEvent(bo, postId) as never)) as PostData;
		await actions.dismissFeedback(postEvent(bo, postId, { requestId: data.feedbackAskingMe!.id }));
		expect((await statuses())[0]).toEqual(['Bo', 'dismissed']);
		expect(await listInbox(env, bo, 'unread')).toEqual([]);
	});

	it('notifies again when the author asks someone who dismissed it', async () => {
		const { env, bo, author, postId, deliverJobs, statuses } = await askedWorld();
		const [item] = await listInbox(env, bo, 'unread');
		await inboxActions.dismissFeedback(inboxEvent(bo, item.itemKey));
		await actions.requestFeedback(postEvent(author, postId, { person: bo.user.id }));
		await deliverJobs();
		expect((await statuses())[0]).toEqual(['Bo', 'waiting']);
		expect(await listInbox(env, bo, 'unread')).toMatchObject([{ kind: 'feedback' }]);
	});

	it('takes the item out of the inbox when the author stops asking', async () => {
		const { env, bo, author, postId, statuses } = await askedWorld();
		const data = (await load(postEvent(author, postId) as never)) as PostData;
		const request = data.feedback.find((r: FeedbackRow) => r.name === 'Bo')!;
		await actions.withdrawFeedback(postEvent(author, postId, { requestId: request.id }));
		expect(await listInbox(env, bo, 'unread')).toEqual([]);
		expect(await statuses()).toEqual([['Cy', 'waiting']]);
	});

	it('refuses a request from anyone but the post’s author', async () => {
		const { bo, cy, postId } = await askedWorld();
		const e = await Promise.resolve(
			actions.requestFeedback(postEvent(bo, postId, { person: cy.user.id }))
		).catch((e: unknown) => e);
		expect(isHttpError(e, 403), `expected 403, got ${String(e)}`).toBe(true);
	});

	it('refuses to ask a guest who isn’t in the project, and never offers them', async () => {
		const w = await postWorld();
		const guest = await w.person('Gus', 'guest');
		const data = (await load(postEvent(w.author, w.postId) as never)) as PostData;
		expect(data.feedbackCandidates.map((p: { name: string }) => p.name)).not.toContain('Gus');
		const e = await Promise.resolve(
			actions.requestFeedback(postEvent(w.author, w.postId, { person: guest.user.id }))
		).catch((e: unknown) => e);
		expect(isHttpError(e, 400), `expected 400, got ${String(e)}`).toBe(true);
		expect(await listInbox(w.env, guest, 'unread')).toEqual([]);
	});

	it('won’t dismiss someone else’s request', async () => {
		const { env, bo, cy } = await askedWorld();
		const [item] = await listInbox(env, bo, 'unread');
		const e = await Promise.resolve(
			inboxActions.dismissFeedback(inboxEvent(cy, item.itemKey))
		).catch((e: unknown) => e);
		expect(isHttpError(e, 404), `expected 404, got ${String(e)}`).toBe(true);
		expect(await listInbox(env, bo, 'unread')).toHaveLength(1);
	});
});
