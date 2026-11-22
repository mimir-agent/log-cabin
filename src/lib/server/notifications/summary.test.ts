import { describe, expect, it } from 'vitest';
import { summarize, type Facts } from './summary';

const trail = { name: 'Trail', private: false };
const camp = { name: 'Camp', private: true };

// One case per notification kind, worded as Campsite's `notification_summary` words it.
const cases: [string, Facts, string][] = [
	[
		'mention in a post',
		{ about: 'mention', in: 'post', title: 'Plan' },
		'Ada mentioned you in Plan'
	],
	[
		'mention in a doc',
		{ about: 'mention', in: 'note', title: 'Notes' },
		'Ada mentioned you in Notes'
	],
	['mention in a comment', { about: 'mention', in: 'comment' }, 'Ada mentioned you in a comment'],
	['mention in a reply', { about: 'mention', in: 'reply' }, 'Ada mentioned you in a reply'],
	['comment', { about: 'comment', title: 'Plan' }, 'Ada commented on Plan'],
	['reply to you', { about: 'reply', whose: 'yours' }, 'Ada replied to your comment'],
	['reply to themselves', { about: 'reply', whose: 'theirs' }, 'Ada replied to their comment'],
	[
		'reply to someone else',
		{ about: 'reply', whose: { author: 'Bo' } },
		'Ada replied to Bo’s comment'
	],
	[
		'reaction to a post',
		{ about: 'reaction', emoji: '👍', what: 'post' },
		'Ada reacted 👍 to your thread'
	],
	[
		'reaction to a comment',
		{ about: 'reaction', emoji: '👍', what: 'comment' },
		'Ada reacted 👍 to your comment'
	],
	[
		'reaction to a reply',
		{ about: 'reaction', emoji: ':party:', what: 'reply' },
		'Ada reacted :party: to your reply'
	],
	[
		'reaction to a doc',
		{ about: 'reaction', emoji: '👍', what: 'note' },
		'Ada reacted 👍 to your doc'
	],
	['post in a channel', { about: 'post', channel: trail }, 'Ada started a thread in Trail'],
	[
		'post in a private channel',
		{ about: 'post', channel: camp },
		'Ada started a thread in 🔒 Camp'
	],
	['feedback request', { about: 'feedback' }, 'Ada requested your feedback'],
	['follow up', { about: 'follow_up', title: 'Plan' }, 'Follow up on Plan'],
	['shared doc', { about: 'note_shared', title: 'Notes' }, 'Ada shared Notes with you'],
	['added to a channel', { about: 'added_to_project', channel: trail }, 'Ada added you to Trail'],
	[
		'added to a private channel',
		{ about: 'added_to_project', channel: camp },
		'Ada added you to 🔒 Camp'
	],
	['archived channel', { about: 'project_archived', channel: trail }, 'Ada archived Trail'],
	[
		'renamed channel',
		{ about: 'project_renamed', channel: trail },
		'Ada renamed a channel to Trail'
	],
	[
		'moved thread',
		{ about: 'post_moved', title: 'Plan', channel: camp },
		'Ada moved Plan to 🔒 Camp'
	]
];

describe('summarize', () => {
	it.each(cases)('%s', (_name, facts, sentence) => {
		expect(summarize('Ada', facts)).toBe(sentence);
	});
});
