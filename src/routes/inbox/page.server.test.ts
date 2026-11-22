import { describe, expect, it } from 'vitest';
import { previewOf } from '#lib/server/notifications/inbox.js';
import { notificationWorld } from '#lib/server/notifications/testing/world.js';
import { load } from './+layout.server';
import { actions } from './+page.server';

type World = ReturnType<typeof notificationWorld>;

function signedIn(userId: string, path = '/inbox', form?: Record<string, string>) {
	const request = new Request(`https://campfire.test${path}`, {
		method: form ? 'POST' : 'GET',
		body: form ? new URLSearchParams(form) : undefined
	});
	return {
		locals: {
			user: {
				id: userId,
				name: userId,
				username: userId,
				email: `${userId}@example.com`,
				avatarUrl: null,
				theme: 'system'
			},
			member: { id: `m-${userId}`, role: 'member' }
		},
		url: new URL(request.url),
		request
	} as never;
}

function notification(w: World, id: string, itemKey: string, createdAt: number, actor = 'ada') {
	w.sqlite
		.prepare(
			"INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, source, created_at) VALUES (?, 'bo', ?, 'comment', ?, ?, ?, ?)"
		)
		.run(id, actor, itemKey, `/posts/${itemKey.split(':')[1]}`, `src:${id}`, createdAt);
}

async function tab(name: string) {
	const data = (await load(signedIn('bo', `/inbox?tab=${name}`))) as {
		items: { itemKey: string; count: number; actorName: string }[];
	};
	return data.items;
}

function world() {
	const w = notificationWorld();
	w.person('ada');
	w.person('bo');
	w.person('cy');
	notification(w, 'n1', 'post:p1', 1);
	notification(w, 'n2', 'post:p1', 3, 'cy');
	notification(w, 'n3', 'post:p2', 2);
	return w;
}

describe('/inbox', () => {
	it('shows unread notifications once per item, newest first, led by the latest', async () => {
		world();
		expect(await tab('unread')).toEqual([
			expect.objectContaining({ itemKey: 'post:p1', count: 2, actorName: 'cy' }),
			expect.objectContaining({ itemKey: 'post:p2', count: 1, actorName: 'ada' })
		]);
	});

	it('marks one item read, moving it to the read tab and updating the live count', async () => {
		const w = world();
		await actions.read(signedIn('bo', '/inbox?/read', { item: 'post:p1' }));
		expect((await tab('unread')).map((item) => item.itemKey)).toEqual(['post:p2']);
		expect((await tab('read')).map((item) => item.itemKey)).toEqual(['post:p1']);
		expect(w.published.at(-1)).toEqual({
			topic: 'user:bo',
			payload: { type: 'inbox.unread', count: 1 }
		});
	});

	it('marks everything read', async () => {
		world();
		await actions.readAll(signedIn('bo', '/inbox?/readAll', {}));
		expect(await tab('unread')).toEqual([]);
		expect(await tab('read')).toHaveLength(2);
	});

	it('archives an item out of unread and read, into archived', async () => {
		world();
		await actions.archive(signedIn('bo', '/inbox?/archive', { item: 'post:p2' }));
		expect((await tab('unread')).map((item) => item.itemKey)).toEqual(['post:p1']);
		expect(await tab('read')).toEqual([]);
		expect((await tab('archived')).map((item) => item.itemKey)).toEqual(['post:p2']);
	});

	it('only ever shows and changes the signed-in person’s own notifications', async () => {
		world();
		await actions.readAll(signedIn('cy', '/inbox?/readAll', {}));
		expect(await tab('unread')).toHaveLength(2);
		const data = (await load(signedIn('cy', '/inbox?tab=unread'))) as { items: unknown[] };
		expect(data.items).toEqual([]);
	});

	it('answers 404 for a tab that doesn’t exist', async () => {
		world();
		await expect(load(signedIn('bo', '/inbox?tab=spam'))).rejects.toMatchObject({ status: 404 });
	});

	it('names each post’s project, with its text until read and its latest comment after', async () => {
		const w = world();
		w.project('tents', 'ada', { private: true, members: ['bo'] });
		w.sqlite
			.prepare(
				"INSERT INTO posts (id, project_id, author_id, title, body, body_text, created_at, last_activity_at) VALUES ('p1', 'tents', 'ada', 'Tents', '{}', 'Which tents do we buy?', 0, 0)"
			)
			.run();
		const comment = w.sqlite.prepare(
			"INSERT INTO comments (id, post_id, author_id, body, body_text, created_at) VALUES (?, 'p1', ?, '{}', ?, ?)"
		);
		comment.run('c1', 'cy', 'The green ones', 1);
		comment.run('c2', 'ada', 'Agreed, two of them', 2);

		const [p1, p2] = await tab('unread');
		expect(p1).toMatchObject({
			itemKey: 'post:p1',
			place: { name: 'tents', private: true },
			preview: 'Which tents do we buy?'
		});
		// No such post (deleted, or not a post at all): nothing to name.
		expect(p2).toMatchObject({ itemKey: 'post:p2', place: null, preview: null });

		await actions.read(signedIn('bo', '/inbox?/read', { item: 'post:p1' }));
		expect((await tab('read'))[0]).toMatchObject({ preview: 'ada: Agreed, two of them' });
	});
});

describe('an inbox row’s preview', () => {
	const post = { text: 'Which tents?', latestComment: { authorName: 'cy', text: 'Green' } };

	it('is the latest comment once the post is seen, else the post’s text', () => {
		expect(previewOf(post, true)).toBe('cy: Green');
		expect(previewOf(post, false)).toBe('Which tents?');
	});

	it('falls back to the post’s text when no one has commented, and to nothing', () => {
		expect(previewOf({ text: 'Which tents?', latestComment: null }, true)).toBe('Which tents?');
		expect(previewOf({ text: '', latestComment: null }, false)).toBeNull();
	});
});

describe('/inbox from the page an item opens', () => {
	it('reads every notification about the page once it is shown', async () => {
		const w = world();
		await actions.readAbout(signedIn('bo', '/inbox?/readAbout', { path: '/inbox/posts/p1' }));
		expect((await tab('unread')).map((item) => item.itemKey)).toEqual(['post:p2']);
		expect(w.published.at(-1)).toEqual({
			topic: 'user:bo',
			payload: { type: 'inbox.unread', count: 1 }
		});
	});

	it('marks the page’s items done: archived, and read with them', async () => {
		world();
		await actions.doneAbout(signedIn('bo', '/inbox?/doneAbout', { path: '/posts/p1' }));
		expect((await tab('unread')).map((item) => item.itemKey)).toEqual(['post:p2']);
		expect((await tab('archived')).map((item) => item.itemKey)).toEqual(['post:p1']);
	});

	it('answers 400 when the form names no page of this site', async () => {
		world();
		await expect(
			actions.readAbout(signedIn('bo', '/inbox?/readAbout', { path: 'https://elsewhere.test/' }))
		).rejects.toMatchObject({ status: 400 });
	});
});
