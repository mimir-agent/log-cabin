import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { atMostEvery } from './own-cursor.js';

describe('atMostEvery', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('sends one state for a burst of keys, and it is the last one', () => {
		const awareness = new Awareness(new Y.Doc());
		const set = vi.spyOn(awareness, 'setLocalState');
		const slowed = atMostEvery(100, awareness);

		for (let key = 1; key <= 5; key++) {
			slowed.setLocalState({ cursor: key });
			vi.advanceTimersByTime(10);
		}
		expect(set).not.toHaveBeenCalled();

		vi.advanceTimersByTime(100);
		expect(set).toHaveBeenCalledTimes(1);
		expect(awareness.getLocalState()).toEqual({ cursor: 5 });
	});

	it('reads back the state it is holding', () => {
		const slowed = atMostEvery(100, new Awareness(new Y.Doc()));

		slowed.setLocalState({ cursor: 1 });
		slowed.setLocalState({ cursor: 2 });

		expect(slowed.getLocalState()).toEqual({ cursor: 2 });
	});

	it('sends a cleared cursor at once, and nothing later puts one back', () => {
		const awareness = new Awareness(new Y.Doc());
		const slowed = atMostEvery(100, awareness);

		slowed.setLocalState({ cursor: 1 });
		slowed.setLocalState({ cursor: 2 });
		vi.advanceTimersByTime(30);
		slowed.setLocalStateField('cursor', null);
		expect(awareness.getLocalState(), 'right after a blur').toEqual({ cursor: null });

		vi.advanceTimersByTime(200);
		expect(awareness.getLocalState(), 'at rest').toEqual({ cursor: null });
	});
});
