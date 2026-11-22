/**
 * Whether a keydown on a note's page copies the note's link: Cmd+Shift+C on Apple devices,
 * Ctrl+Shift+C elsewhere, as in Campsite. A key pressed in a field or an editor is text, so it
 * doesn't copy there, except in the note's own body (inside `noteBody`), where it does.
 */
export function copiesNoteLink(
	event: KeyboardEvent,
	noteBody: Element | null,
	apple: boolean
): boolean {
	const mod = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
	if (!mod || !event.shiftKey || event.altKey || event.key.toLowerCase() !== 'c') return false;
	if (!(event.target instanceof Element)) return true;
	const field = event.target.closest(
		'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
	);
	if (field === null) return true;
	return field.matches('[contenteditable]') && noteBody !== null && noteBody.contains(field);
}
