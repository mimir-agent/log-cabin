import { describe, expect, it } from 'vitest';
import { chat } from '#lib/strings/chat.js';
import { replyLabel } from './reply-label.js';

const s = chat.thread;
const ada = { id: 'ada', name: 'Ada' };
const bo = { id: 'bo', name: 'Bo' };

describe('replyLabel', () => {
	it('says "you" to the person whose message was answered by someone else', () => {
		expect(replyLabel({ quoted: ada, replier: bo, viewerId: ada.id })).toBe(s.replyingToYou);
	});

	it('says "yourself" to a person who answered their own message', () => {
		expect(replyLabel({ quoted: ada, replier: ada, viewerId: ada.id })).toBe(s.replyingToYourself);
	});

	it('gives the name to everyone else', () => {
		expect(replyLabel({ quoted: ada, replier: bo, viewerId: 'cy' })).toBe(s.replyingTo('Ada'));
		expect(replyLabel({ quoted: ada, replier: ada, viewerId: 'cy' })).toBe(s.replyingTo('Ada'));
		expect(replyLabel({ quoted: bo, replier: ada, viewerId: ada.id })).toBe(s.replyingTo('Bo'));
	});
});
