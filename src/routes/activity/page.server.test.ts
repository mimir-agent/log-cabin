import { describe, expect, it } from 'vitest';
import { notificationWorld } from '#lib/server/notifications/testing/world.js';
import { load } from './+page.server';

function signedIn(userId: string, role: string) {
	const url = new URL('https://campfire.test/activity');
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
			member: { id: `m-${userId}`, role }
		},
		url
	} as never;
}

describe('/activity', () => {
	function world() {
		const w = notificationWorld();
		w.person('ada');
		w.person('bo');
		w.person('guest', 'guest');
		w.project('open', 'ada');
		w.project('secret', 'ada', { members: ['ada'] });
		w.sqlite.exec("UPDATE projects SET private = 1 WHERE id = 'secret'");
		w.project('guests', 'ada', { members: ['guest'] });
		w.sqlite.exec("UPDATE projects SET private = 1 WHERE id = 'guests'");
		w.post('p-open', 'open', 'ada');
		w.post('p-secret', 'secret', 'ada');
		w.post('p-guests', 'guests', 'ada');
		w.comment('c1', 'p-open', 'bo');
		w.sqlite.exec("UPDATE comments SET created_at = 5 WHERE id = 'c1'");
		return w;
	}

	const urls = async (userId: string, role: string) =>
		((await load(signedIn(userId, role))) as { entries: { url: string }[] }).entries.map(
			(entry) => entry.url
		);

	it('lists recent posts and comments, newest first, in the projects a member can see', async () => {
		world();
		expect(await urls('bo', 'member')).toEqual(['/posts/p-open#comment-c1', '/posts/p-open']);
		expect((await urls('ada', 'member')).sort()).toEqual(
			['/posts/p-open#comment-c1', '/posts/p-open', '/posts/p-secret'].sort()
		);
	});

	it('shows a guest only the projects they were added to', async () => {
		world();
		expect(await urls('guest', 'guest')).toEqual(['/posts/p-guests']);
	});
});
