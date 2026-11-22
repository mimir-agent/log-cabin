import { describe, expect, it } from 'vitest';
import { notifications } from './notifications';

// The inbox row and the push notification's title read these lines.
describe('a notification’s line', () => {
	it('says a comment on a doc is about a doc, and a comment on a post about the post', () => {
		expect(notifications.line('Ada', 'comment', 'note:n1')).toBe('Ada commented on a doc');
		expect(notifications.line('Ada', 'comment', 'post:p1')).toBe(
			'Ada commented on a thread you follow'
		);
		expect(notifications.preview('comment', 'note:n1')).toBe('commented on a doc');
		expect(notifications.preview('comment', 'post:p1')).toBe('commented on a thread you follow');
	});

	it('reads the same for every other kind, whatever the item', () => {
		expect(notifications.line('Ada', 'mention', 'note:n1')).toBe('Ada mentioned you');
		expect(notifications.line('Ada', 'reply', 'post:p1')).toBe('Ada replied to your comment');
		expect(notifications.preview('follow_up', 'follow_up:f1')).toBe('Follow up');
	});
});

describe('lane N’s summary and mail strings', () => {
	it('marks a private channel with a lock, as Campsite does', () => {
		const s = notifications.summary;
		expect(s.addedTo('Ada', s.channel('Design', true))).toBe('Ada added you to 🔒 Design');
		expect(s.postedIn('Ada', s.channel('Design', false))).toBe('Ada started a thread in Design');
		expect(s.reaction('Ada', '👍', 'post')).toBe('Ada reacted 👍 to your thread');
		expect(s.replyTo('Ada', s.whose.named('Grace'))).toBe('Ada replied to Grace’s comment');
	});

	it('names up to three posters in a digest byline, then counts the rest', () => {
		expect(notifications.digestByline(1, ['Ada'])).toBe('1 thread by Ada');
		expect(notifications.digestByline(4, ['Ada', 'Bo', 'Cy', 'Di'])).toBe(
			'4 threads by Ada, Bo, Cy, and Di'
		);
		expect(notifications.digestByline(9, ['Ada', 'Bo', 'Cy', 'Di', 'Ed'])).toBe(
			'9 threads by Ada, Bo, Cy, and 2 others'
		);
	});
});
