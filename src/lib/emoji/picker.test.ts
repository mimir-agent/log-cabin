import { describe, expect, it } from 'vitest';
import { unicodeSections } from './data';
import { quickReactions, search } from './picker';

const names = (query: string) => search(unicodeSections, query).map((e) => e.name);

describe('emoji search', () => {
	it('matches the start of a word, so “tent” finds the tent and not “content”', () => {
		expect(names('tent')[0]).toBe('tent');
		expect(names('tent')).not.toContain('relieved_face');
	});

	it('needs every word of the query', () => {
		expect(names('thumbs up')[0]).toBe('thumbs_up');
		expect(names('thumbs up')).not.toContain('thumbs_down');
	});
});

describe('a message’s quick reactions', () => {
	it('are the five most picked here, then Campsite’s defaults, each once', () => {
		expect(quickReactions({})).toEqual(['👍', '❤️', '🤔', '😂', '😮']);
		expect(quickReactions({ '🎉': 1, '👍': 3, '🔥': 2 })).toEqual(['👍', '🔥', '🎉', '❤️', '🤔']);
	});
});
