import { describe, expect, it } from 'vitest';
import { bodyPreview, excerpt, messagePreview, pushPayload } from './preview';

describe('bodyPreview', () => {
	it('quotes a mention after "<actor> mentioned you"', () => {
		expect(bodyPreview('Ada mentioned you', 'Can you look at this?')).toBe(
			'Ada mentioned you: Can you look at this?'
		);
	});

	it('quotes a post after the author’s name', () => {
		expect(bodyPreview('Ada started a thread', 'We ship on Friday.')).toBe(
			'Ada started a thread: We ship on Friday.'
		);
	});

	it('quotes a comment after the author’s name', () => {
		expect(bodyPreview('Bo', 'Looks good\nto me')).toBe('Bo: Looks good to me');
	});

	it('gives no excerpt for a body with no words', () => {
		expect(bodyPreview('Bo', ' \n ')).toBeNull();
	});
});

describe('excerpt', () => {
	it('keeps a short body whole', () => {
		expect(excerpt('Hello there')).toBe('Hello there');
	});

	it('cuts a long body at a word, within 140 characters', () => {
		const long = 'word '.repeat(60);
		const cut = excerpt(long)!;
		expect(cut.length).toBeLessThanOrEqual(140);
		expect(cut).toMatch(/word…$/);
	});

	it('keeps a body of exactly 140 characters whole', () => {
		const exact = 'a'.repeat(140);
		expect(excerpt(exact)).toBe(exact);
	});
});

describe('messagePreview', () => {
	const text = { bodyText: 'Lunch?', hasAttachment: false };

	it('names the sender in a group chat', () => {
		expect(messagePreview('Ada', text, false)).toBe('Ada: Lunch?');
	});

	it('shows the text alone in a 1:1 chat', () => {
		expect(messagePreview('Ada', text, true)).toBe('Lunch?');
	});

	it('says a message with only a file sent an attachment', () => {
		expect(messagePreview('Ada', { bodyText: '', hasAttachment: true }, false)).toBe(
			'Ada sent an attachment'
		);
	});
});

describe('pushPayload', () => {
	const mention = {
		kind: 'mention',
		title: 'Plan',
		url: '/posts/p1',
		preview: 'Ada mentioned you: Look here'
	};

	it('titles a push with the sentence and bodies it with the preview', () => {
		expect(pushPayload(mention, 'Ada mentioned you in Plan', 3)).toEqual({
			title: 'Ada mentioned you in Plan',
			body: 'Ada mentioned you: Look here',
			url: '/posts/p1',
			unread: 3
		});
	});

	it('titles a message’s push with its thread’s name', () => {
		const message = {
			kind: 'message',
			title: 'Trail crew',
			url: '/chat/t1',
			preview: 'Ada: Lunch?'
		};
		expect(pushPayload(message, 'Ada sent you a message', 1)).toMatchObject({
			title: 'Trail crew',
			body: 'Ada: Lunch?'
		});
	});

	it('has no body when there is no preview', () => {
		expect(pushPayload({ ...mention, preview: undefined }, 'Ada reacted', 1).body).toBeNull();
	});
});
