import { search as strings } from './strings/search';

/** What search can look for, shared by the server and the pages. */
export const searchKinds = [
	'post',
	'comment',
	'note',
	'member',
	'message',
	'project',
	'call'
] as const;
export type SearchKind = (typeof searchKinds)[number];

/** What a result without a title is called. */
export const untitled = (kind: SearchKind) =>
	kind === 'call' ? strings.page.untitledCall : strings.page.untitled;

/** Marks around matched words in titles and snippets; pages render them as <mark>. */
export const markStart = '\u0002';
export const markEnd = '\u0003';

/** Splits marked text into plain and matched parts, in order. */
export function markedParts(text: string): { text: string; match: boolean }[] {
	return text.split(markStart).flatMap((chunk, i) => {
		if (i === 0) return [{ text: chunk, match: false }];
		const [match, rest = ''] = chunk.split(markEnd);
		return [
			{ text: match, match: true },
			{ text: rest, match: false }
		];
	});
}
