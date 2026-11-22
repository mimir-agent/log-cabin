// What an e2e spec needs from a note's live editor beyond what the page shows.
import { expect, type Locator } from '@playwright/test';

/**
 * Options for the browser context of someone who types into a live note. Its zone is UTC, the
 * one the server writes in until a browser names another, so the first visit doesn't reload the
 * page's data, which starts the live editor again and drops the keys typed meanwhile.
 */
export const liveContext = { timezoneId: 'UTC' };

/** The editor ProseMirror keeps on its element, as much of it as a spec reads. */
type EditorElement = HTMLElement & {
	editor: {
		view: {
			state: { selection: { head: number } };
			posAtDOM(node: Node, offset: number): number;
		};
	};
};

/**
 * Waits until the editor has taken in the caret the browser just moved (a click, End). Chromium
 * reports a moved caret with a selectionchange event a moment later, and a key pressed before
 * then acts where the editor last had the caret, not where it is on screen.
 */
export async function caretTaken(body: Locator) {
	await expect
		.poll(
			() =>
				body.evaluate((element) => {
					const { view } = (element as EditorElement).editor;
					const { focusNode, focusOffset } = getSelection()!;
					return view.state.selection.head === view.posAtDOM(focusNode!, focusOffset);
				}),
			{ message: 'the editor has the caret where the browser shows it' }
		)
		.toBe(true);
}
