import { afterEach, describe, expect, it } from 'vitest';
import { copiesNoteLink } from './copy-link';

// A note page's parts, as real elements: the note's body editor, a comment box (also an
// editor), the title field.
function notePage() {
	document.body.innerHTML = `
		<input class="title" />
		<div class="body"><div class="editor" contenteditable="true"><p>Text</p></div></div>
		<div class="comment" contenteditable="true"></div>
		<button class="plain">Share</button>`;
	const el = (selector: string) => document.querySelector(selector)!;
	return { el, noteBody: el('.body') };
}

/** A keydown sent from `target`, which it keeps as its target once dispatched. */
function keydown(target: Element, init: KeyboardEventInit) {
	const event = new KeyboardEvent('keydown', { bubbles: true, ...init });
	target.dispatchEvent(event);
	return event;
}

const copyKeys = { key: 'C', shiftKey: true, ctrlKey: true };

afterEach(() => {
	document.body.innerHTML = '';
});

describe('the copy-link shortcut on a note', () => {
	it('copies from the page itself and from the note’s body', () => {
		const { el, noteBody } = notePage();
		expect(copiesNoteLink(keydown(document.body, copyKeys), noteBody, false), 'page').toBe(true);
		expect(copiesNoteLink(keydown(el('.plain'), copyKeys), noteBody, false), 'a button').toBe(true);
		expect(copiesNoteLink(keydown(el('.editor p'), copyKeys), noteBody, false), 'body').toBe(true);
	});

	it('leaves the keys to the comment box and the title field', () => {
		const { el, noteBody } = notePage();
		expect(copiesNoteLink(keydown(el('.comment'), copyKeys), noteBody, false), 'comment').toBe(
			false
		);
		expect(copiesNoteLink(keydown(el('.title'), copyKeys), noteBody, false), 'title').toBe(false);
	});

	it('needs Cmd and Shift on Apple devices, Ctrl and Shift elsewhere, with C', () => {
		const { noteBody } = notePage();
		const press = (init: KeyboardEventInit, apple: boolean) =>
			copiesNoteLink(keydown(document.body, init), noteBody, apple);
		expect(press({ key: 'C', shiftKey: true, metaKey: true }, true), 'Cmd+Shift+C').toBe(true);
		expect(press({ key: 'C', shiftKey: true, ctrlKey: true }, true), 'Ctrl on a Mac').toBe(false);
		expect(press({ key: 'C', shiftKey: true, metaKey: true }, false), 'Cmd elsewhere').toBe(false);
		expect(press({ key: 'c', ctrlKey: true }, false), 'no Shift: plain copy').toBe(false);
		expect(press({ key: 'C', shiftKey: true }, false), 'no modifier').toBe(false);
		expect(press({ key: 'V', shiftKey: true, ctrlKey: true }, false), 'another key').toBe(false);
	});
});
