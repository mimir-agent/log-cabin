// The list `:` opens: which typed text opens it, which emoji it offers, and what typing a whole
// `:name:` turns into. Nothing here draws; the list is EmojiMenu.svelte, driven by emojiMenu()
// in components/editor.
import type { findSuggestionMatch } from '@tiptap/suggestion';
import type { PickerEmoji, PickerSection } from '../emoji/data';
import { customSection, search, type OrgEmoji } from '../emoji/picker';
import { triggerMatch } from './slash';

/** How many emoji the list shows. */
const listed = 8;

/**
 * Where `:` opens the list: where `/` does, once two characters follow it, and not when the
 * query holds another `:` (a whole `:name:` is typed, and converts instead). So `10:30` and
 * `https://` don't open it.
 */
export const emojiMatch: typeof findSuggestionMatch = (trigger) => {
	const match = triggerMatch(trigger);
	return match && /^[^:]{2,}$/.test(match.query) ? match : null;
};

/** The org's emoji, then the standard ones, whose name or keywords start with each word typed. */
export function filterEmoji(
	query: string,
	standard: PickerSection[],
	org: OrgEmoji
): PickerEmoji[] {
	return search([customSection(org), ...standard], query).slice(0, listed);
}

/**
 * The standard emoji data, once loaded. It is a separate chunk that only an editor with the
 * `:` list needs; the list loads it when the editor is made, so a typed `:name:` finds it.
 */
let loaded: PickerSection[] | undefined;

export async function loadEmoji(): Promise<PickerSection[]> {
	loaded ??= (await import('../emoji/data')).unicodeSections;
	return loaded;
}

/**
 * The character a typed `:name:` stands for: the standard emoji whose name is `name`, else the
 * first whose keywords include it (`tada`). Nothing before the data has loaded, or for the org's
 * own emoji, which RichText draws from the text as typed.
 */
export function emojiNamed(name: string): string | undefined {
	const all = loaded?.flatMap((section) => section.items) ?? [];
	const word = (emoji: PickerEmoji) => emoji.terms.split(/[\s_]+/).includes(name);
	return (all.find((emoji) => emoji.name === name) ?? all.find(word))?.value;
}
