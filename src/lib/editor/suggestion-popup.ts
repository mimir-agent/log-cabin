/**
 * Where an editor's suggestion list goes: under the caret when it fits in what the person can see,
 * above it when it doesn't, and always inside that area. "What the person can see" is the visual
 * viewport, so a phone's keyboard and a pinch zoom count. The @ list uses it; so do the lists that
 * follow it.
 */

/** A rectangle in the coordinates `position: fixed` uses. */
type Box = { left: number; top: number; width: number; height: number };

/** The caret's rectangle: what Tiptap's `clientRect()` gives. */
type Caret = { left: number; top: number; bottom: number };

export type Point = { left: number; top: number };

/** Keeps `value` in `[min, max]`; when the range is empty (a popup larger than the area), `min` wins. */
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/**
 * The top-left corner for a popup of `size`, `gap` away from the caret. It sits below the caret
 * unless its bottom edge would pass the bottom of `visible`, and then above. Either way it is
 * pulled back inside `visible`.
 */
export function placePopup(
	caret: Caret,
	size: Pick<Box, 'width' | 'height'>,
	visible: Box,
	gap: number
): Point {
	const below = caret.bottom + gap;
	const fitsBelow = below + size.height <= visible.top + visible.height;
	const top = fitsBelow ? below : caret.top - gap - size.height;
	return {
		left: clamp(caret.left, visible.left, visible.left + visible.width - size.width),
		top: clamp(top, visible.top, visible.top + visible.height - size.height)
	};
}

/** What the person can see, in `position: fixed` coordinates. */
export function visibleArea(): Box {
	const { offsetLeft, offsetTop, width, height } = window.visualViewport!;
	return { left: offsetLeft, top: offsetTop, width, height };
}

/** Calls `replace` when the visible area changes (the keyboard opens, a pinch zoom, a pan). Returns the stop. */
export function watchVisibleArea(replace: () => void): () => void {
	const viewport = window.visualViewport!;
	viewport.addEventListener('resize', replace);
	viewport.addEventListener('scroll', replace);
	return () => {
		viewport.removeEventListener('resize', replace);
		viewport.removeEventListener('scroll', replace);
	};
}

/**
 * Where a list for `editor` is mounted: inside the dialog that holds it, if one does. A modal
 * dialog turns off pointer events on the page behind it, so a list mounted on the body can't be
 * clicked or tapped, and a click on it would count as outside the dialog.
 */
export function popupHost(editor: Element): HTMLElement {
	return editor.closest<HTMLElement>('[role="dialog"]') ?? document.body;
}
