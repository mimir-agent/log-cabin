// Small rules the emoji picker keeps between opens: skin tone and what you pick most.
import type { PickerEmoji, PickerSection } from './data';

/** What the picker and reactions know of the org's own emoji, from the root layout. */
export type OrgEmoji = {
	/** :name: → image URL, e.g. { campfire: '/files/emoji/<id>' }. */
	custom: Record<string, string>;
	/** Names the picker's section of the org's emoji. */
	orgName: string;
	/** Whether this member may add more, which the picker links to when nothing matches. */
	canAdd: boolean;
};

/** The org's own emoji as a section, each picked as the text `:name:`, which RichText draws as its image. */
export function customSection(org: OrgEmoji): PickerSection {
	return {
		id: 'custom',
		title: org.orgName,
		items: Object.entries(org.custom).map(([name, url]) => ({
			value: `:${name}:`,
			name,
			skinTones: false,
			terms: name,
			url
		}))
	};
}

const toneModifiers = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];
export const skinTones = toneModifiers.map((m, i) => ({ value: i, sample: i ? `✋${m}` : '✋' }));

/** The emoji in the chosen skin tone, when it has tones: the modifier follows its first character. */
export function withSkinTone(emoji: PickerEmoji, tone: number): string {
	if (!emoji.skinTones || tone === 0) return emoji.value;
	const [first, ...rest] = [...emoji.value];
	const tail = rest.join('').replace(/^\ufe0f/, '');
	return first + toneModifiers[tone] + tail;
}

const toneKey = 'campfire:emoji-skin-tone';
const usedKey = 'campfire:emoji-used';
// Shown under Frequently used before someone has picked anything.
const starters = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👀', '🙏'];

export function savedSkinTone(): number {
	const tone = Number(localStorage.getItem(toneKey));
	return tone in toneModifiers ? tone : 0;
}

export function saveSkinTone(tone: number) {
	localStorage.setItem(toneKey, String(tone));
}

/** How often each emoji has been picked here, by value. */
export function savedPickCounts(): Record<string, number> {
	return JSON.parse(localStorage.getItem(usedKey) ?? '{}');
}

/** Counts a pick toward Frequently used. Values are stored without skin tone. */
export function countUse(value: string) {
	const counts = savedPickCounts();
	counts[value] = (counts[value] ?? 0) + 1;
	localStorage.setItem(usedKey, JSON.stringify(counts));
}

/** The 16 most picked, most first; the starters until there's a history. */
export function frequentlyUsed(
	all: Map<string, PickerEmoji>,
	counts: Record<string, number>
): PickerEmoji[] {
	const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
	return (ranked.length ? ranked : starters).flatMap((v) => all.get(v) ?? []).slice(0, 16);
}

/**
 * Every section's emoji with a word starting with each word of the query. Whole words in the
 * name come first, then whole keywords, then the rest, each group in picker order.
 */
export function search(sections: PickerSection[], query: string): PickerEmoji[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const seen = new Set<string>();
	const rank = (e: PickerEmoji, terms: string[]) =>
		words.every((w) => e.name.split(/[_-]/).includes(w))
			? 0
			: words.every((w) => terms.includes(w))
				? 1
				: 2;
	return sections
		.flatMap((s) => s.items)
		.flatMap((e) => {
			const terms = e.terms.split(/[\s_]+/);
			if (seen.has(e.value) || !words.every((w) => terms.some((t) => t.startsWith(w)))) return [];
			seen.add(e.value);
			return [{ e, rank: rank(e, terms) }];
		})
		.sort((a, b) => a.rank - b.rank)
		.map(({ e }) => e);
}

/** Campsite's default quick reactions, after OverflowDefaultReactionMenu (CC BY-NC 4.0). */
const quickDefaults = ['👍', '❤️', '🤔', '😂', '😮'];

/** A message's five quick reactions: the most picked here first, then Campsite's defaults. */
export function quickReactions(counts: Record<string, number>): string[] {
	const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
	return [...new Set([...ranked, ...quickDefaults])].slice(0, 5);
}
