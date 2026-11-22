import { describe, expect, it } from 'vitest';
import { archiveAbout, inboxAbout, itemPath, markReadAbout } from './inbox';
import { notificationWorld } from './testing/world';

function world() {
	const w = notificationWorld();
	for (const id of ['ada', 'bo', 'cy']) w.person(id);
	const insert = w.sqlite.prepare(
		"INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, source, created_at) VALUES (?, ?, 'ada', 'comment', ?, ?, ?, 1)"
	);
	// bo has four kinds of notification about post p1, and one each about p10 (whose address
	// starts with p1's) and a note.
	insert.run('n1', 'bo', 'post:p1', '/posts/p1', 's1');
	insert.run('n2', 'bo', 'post:p1', '/posts/p1#comment-c1', 's2');
	insert.run('n3', 'bo', 'reactions:post:p1', '/posts/p1', 's3');
	insert.run('n4', 'bo', 'feedback:f1', '/posts/p1?x=1', 's4');
	insert.run('n5', 'bo', 'post:p10', '/posts/p10', 's5');
	insert.run('n6', 'bo', 'note:n1', '/notes/n1', 's6');
	insert.run('n7', 'cy', 'post:p1', '/posts/p1', 's7');
	return w;
}

const unreadItems = (w: ReturnType<typeof world>, userId: string) =>
	(
		w.sqlite
			.prepare('SELECT DISTINCT item_key FROM notifications WHERE user_id = ? AND read_at IS NULL')
			.all(userId) as { item_key: string }[]
	)
		.map((row) => row.item_key)
		.sort();

describe('the notifications about a page', () => {
	it('are every unread one whose link opens it, whatever the item or the link’s fragment', async () => {
		const w = world();
		await markReadAbout(w.env, 'bo', '/posts/p1');
		expect(unreadItems(w, 'bo'), 'p10 and the note are other items').toEqual([
			'note:n1',
			'post:p10'
		]);
		expect(unreadItems(w, 'cy'), 'someone else’s inbox is theirs').toEqual(['post:p1']);
	});

	it('tell the person’s unread count, once, and only when it changed', async () => {
		const w = world();
		await markReadAbout(w.env, 'bo', '/posts/p1');
		expect(w.published).toEqual([
			{ topic: 'user:bo', payload: { type: 'inbox.unread', count: 2 } }
		]);
		await markReadAbout(w.env, 'bo', '/posts/p1');
		expect(w.published, 'nothing was unread any more').toHaveLength(1);
	});

	it('are one page when the inbox opens a post beside its list', async () => {
		const w = world();
		await markReadAbout(w.env, 'bo', itemPath('/inbox/posts/p1'));
		expect(unreadItems(w, 'bo')).toEqual(['note:n1', 'post:p10']);
		expect(itemPath('/inbox'), 'the list itself is not a post').toBe('/inbox');
	});

	it('say which inbox items are about it and whether any is unread, until they are archived', async () => {
		const w = world();
		expect(await inboxAbout(w.env, 'bo', '/posts/p1')).toEqual({
			path: '/posts/p1',
			itemKeys: ['feedback:f1', 'post:p1', 'reactions:post:p1'],
			unread: true
		});
		await markReadAbout(w.env, 'bo', '/posts/p1');
		expect(await inboxAbout(w.env, 'bo', '/posts/p1')).toMatchObject({ unread: false });
		await archiveAbout(w.env, 'bo', '/posts/p1');
		expect(await inboxAbout(w.env, 'bo', '/posts/p1')).toEqual({
			path: '/posts/p1',
			itemKeys: [],
			unread: false
		});
	});

	it('are archived as one, which also reads them', async () => {
		const w = world();
		await archiveAbout(w.env, 'bo', '/posts/p1');
		expect(unreadItems(w, 'bo')).toEqual(['note:n1', 'post:p10']);
		const archived = w.sqlite
			.prepare("SELECT id FROM notifications WHERE user_id = 'bo' AND archived_at IS NOT NULL")
			.all();
		expect(archived).toHaveLength(4);
		expect(w.published.at(-1)).toEqual({
			topic: 'user:bo',
			payload: { type: 'inbox.unread', count: 2 }
		});
	});
});
