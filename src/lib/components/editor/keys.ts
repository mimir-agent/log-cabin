/**
 * ⌘ or Ctrl with Enter: sends from anywhere in a composer, as in Campsite. A composer takes it
 * in the capture phase and stops it there, or the editor would also turn it into a line break.
 * Never while an input method is composing: that Enter picks a candidate.
 */
export function isModEnter(event: KeyboardEvent): boolean {
	return event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing;
}
