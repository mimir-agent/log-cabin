import { describe, expect, it } from 'vitest';
import { core } from './core';
import { editor } from './editor';

describe('writing surface strings', () => {
	it('keeps every save state within the phone bar’s second line', () => {
		for (const word of Object.values(core.saveState)) expect(word.length).toBeLessThanOrEqual(18);
	});

	it('keeps the empty-line hint to one phone line', () => {
		expect(editor.slash.emptyLineHint.length).toBeLessThanOrEqual(40);
	});
});
