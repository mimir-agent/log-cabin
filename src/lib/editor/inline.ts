// Inline tokens inside plain text: #tags and :custom-emoji:. The server reads tags from a
// post's text with the same pattern the renderer links, so what links is what's indexed.

// Campsite's tag name (two to 32 letters, digits and hyphens, not starting or ending with a
// hyphen), lowercased. A tag needs a letter, so issue numbers like #42 stay plain text. It
// must start the text or follow a character that can't be part of a word or a URL.
const tagPattern = /(?<![\p{L}\p{N}_&/#-])#([a-z0-9][a-z0-9-]{0,30}[a-z0-9])(?![a-z0-9-])/giu;
const hasLetter = /[a-z]/i;

/** A custom emoji's name: lowercase letters, digits, - and _, 2 to 32 characters. */
export const emojiNamePattern = /^[a-z0-9_-]{2,32}$/;
const emojiPattern = /:([a-z0-9_-]{2,32}):/g;

export const maxPostTags = 10;

/** The distinct tags in a text, lowercased, in order of first use. */
export function textTags(text: string): string[] {
	const tags = new Set<string>();
	for (const match of text.matchAll(tagPattern)) {
		if (hasLetter.test(match[1])) tags.add(match[1].toLowerCase());
	}
	return [...tags];
}

export type InlinePart =
	| { type: 'text'; value: string }
	| { type: 'tag'; value: string; tag: string }
	| { type: 'emoji'; value: string; name: string; url: string };

/**
 * Splits text into plain runs, #tags (when `tags` is on) and the org's custom emoji (names
 * found in `emoji`, a name → image URL map). Anything else stays text.
 */
export function inlineParts(
	text: string,
	{ tags, emoji }: { tags: boolean; emoji: Record<string, string> }
): InlinePart[] {
	const found: (InlinePart & { at: number })[] = [];
	if (tags) {
		for (const m of text.matchAll(tagPattern)) {
			if (hasLetter.test(m[1])) {
				found.push({ type: 'tag', value: m[0], tag: m[1].toLowerCase(), at: m.index });
			}
		}
	}
	for (const m of text.matchAll(emojiPattern)) {
		const url = emoji[m[1]];
		if (url) found.push({ type: 'emoji', value: m[0], name: m[1], url, at: m.index });
	}
	found.sort((a, b) => a.at - b.at);
	const parts: InlinePart[] = [];
	let from = 0;
	// Tags hold no ':' and emoji names no '#', so the two never overlap.
	for (const { at, ...part } of found) {
		if (at > from) parts.push({ type: 'text', value: text.slice(from, at) });
		parts.push(part);
		from = at + part.value.length;
	}
	if (from < text.length) parts.push({ type: 'text', value: text.slice(from) });
	return parts;
}
