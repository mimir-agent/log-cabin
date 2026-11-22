import { describe, expect, it } from 'vitest';
import { notifications } from './notifications';
import { posts } from './posts';

describe('resolve and share strings', () => {
	it('words resolving as Campsite does', () => {
		const s = notifications.summary;
		expect(s.commentResolved('Ada')).toBe('Ada resolved your comment');
		expect(s.postResolved('Ada', 'Launch plan')).toBe('Ada resolved Launch plan');
		expect(s.postResolvedFromComment('Ada', s.untitledPost('Grace'))).toBe(
			'Ada resolved Grace’s thread with your comment'
		);
		expect(posts.comments.resolvedThread('Ada')).toBe('Ada resolved this thread');
		expect(posts.comments.resolvedThread(null)).toBe('This thread was resolved');
	});

	it('names the post’s author in a shared post’s message only when someone else wrote it', () => {
		expect(posts.share.message('Ada', null, false)).toBe('Ada shared a thread');
		expect(posts.share.message('Ada', 'Grace', false)).toBe('Ada shared a thread by Grace');
		expect(posts.share.message('Ada', 'Grace', true)).toBe('Ada shared a poll by Grace');
		expect(posts.share.sent(1)).toBe('Sent to 1 DM');
		expect(posts.share.sent(3)).toBe('Sent to 3 DMs');
	});
});
