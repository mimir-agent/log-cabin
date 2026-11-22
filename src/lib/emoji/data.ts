// The Unicode emoji the picker offers, from two MIT-licensed datasets by Mu-An Chiou:
// unicode-emoji-json (groups, order, names, skin-tone support) and emojilib (search keywords).
// This module is loaded only when a picker opens, so the data stays out of the main bundle.
import groups from 'unicode-emoji-json/data-by-group.json';
import keywords from 'emojilib';

export type PickerEmoji = {
	/** What a pick sends: the character, or :name: for one of the org's own. */
	value: string;
	/** Shown in the footer and used as the button's accessible name, e.g. thumbs_up. */
	name: string;
	skinTones: boolean;
	/** Lowercased words a search matches against. */
	terms: string;
	/** The org's image for a custom emoji. */
	url?: string;
};

export type PickerSection = { id: string; title: string; items: PickerEmoji[] };

type Group = {
	name: string;
	slug: string;
	emojis: { emoji: string; name: string; slug: string; skin_tone_support: boolean }[];
};

export const unicodeSections: PickerSection[] = (groups as Group[]).map((group) => ({
	id: group.slug,
	title: group.name,
	items: group.emojis.map((e) => ({
		value: e.emoji,
		name: e.slug,
		skinTones: e.skin_tone_support,
		terms: [e.name, ...(keywords[e.emoji] ?? [])].join(' ').toLowerCase()
	}))
}));
