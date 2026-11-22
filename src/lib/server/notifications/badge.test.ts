import { describe, expect, it } from 'vitest';
import type { SignedIn } from '../auth/session';
import { listInbox } from './inbox';
import { notify, unreadCount } from './notify';
import { notificationWorld } from './testing/world';

describe('the nav badge', () => {
	it('counts the unread inbox rows, so several notifications about one item count once', async () => {
		const w = notificationWorld();
		for (const id of ['ada', 'bo', 'cy']) w.person(id);
		const about = (itemKey: string, source: string, actorId = 'bo') =>
			notify(w.env, ['ada'], {
				actorId,
				kind: 'comment',
				itemKey,
				url: '/',
				title: 'Budget kickoff',
				facts: { about: 'comment', title: 'Budget kickoff' },
				source
			});
		await about('post:p1', 'c1');
		await about('post:p1', 'c2', 'cy');
		await about('post:p1', 'c3');
		await about('thread:t1', 'm1');

		const ada = { user: { id: 'ada' }, member: { role: 'member' } } as SignedIn;
		const rows = await listInbox(w.env, ada, 'unread');
		expect(
			rows.map((row) => row.count),
			'one row with 3, one with 1'
		).toEqual([1, 3]);
		expect(await unreadCount(w.env, 'ada')).toBe(rows.length);
		expect(w.published.at(-1)).toEqual({
			topic: 'user:ada',
			payload: { type: 'inbox.unread', count: 2 }
		});
	});
});
