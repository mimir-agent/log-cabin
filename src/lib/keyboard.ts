/** A key pressed in a field or an editor is text, not a shortcut. */
export const typingIn = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || target.closest('input, textarea, select') !== null);
