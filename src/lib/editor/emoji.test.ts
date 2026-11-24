import { beforeAll, describe, expect, test } from 'vitest';
import type { Node } from '@tiptap/pm/model';
import { documentSchema } from './extensions.js';
import { emojiMatch, emojiNamed, filterEmoji, loadEmoji } from './emoji.js';
import type { PickerSection } from '../emoji/data';
import type { OrgEmoji } from '../emoji/picker';

const schema = documentSchema();
const text = (value: string, marks: string[] = []) =>
	schema.text(
		value,
		marks.map((name) => schema.marks[name].create())
	);
const paragraph = (...content: Node[]) => schema.nodes.paragraph.create(null, content);
const codeBlock = (...content: Node[]) => schema.nodes.codeBlock.create(null, content);

/** What the list finds when the caret is at the end of `block`: the typed query, or null. */
function queryAtEnd(block: Node): string | null {
	const doc = schema.node('doc', null, [block]);
	const match = emojiMatch({
		char: ':',
		allowSpaces: false,
		allowToIncludeChar: false,
		allowedPrefixes: [' '],
		startOfLine: false,
		$position: doc.resolve(block.nodeSize - 1)
	});
	return match && match.query;
}

describe('emojiMatch', () => {
	test('opens after the colon and two characters, at the start of a block or after a space', () => {
		expect(queryAtEnd(paragraph(text(':ta')))).toBe('ta');
		expect(queryAtEnd(paragraph(text('Well done :tada')))).toBe('tada');
	});

	test('waits for the second character', () => {
		expect(queryAtEnd(paragraph(text(':')))).toBeNull();
		expect(queryAtEnd(paragraph(text(':t')))).toBeNull();
	});

	test('stays shut after a digit or a letter: a time, or the colon in an address', () => {
		expect(queryAtEnd(paragraph(text('Meet at 10:30')))).toBeNull();
		expect(queryAtEnd(paragraph(text('see https://example.com')))).toBeNull();
		expect(queryAtEnd(paragraph(text('Note:todo')))).toBeNull();
	});

	test('stays shut in a code block and in inline code', () => {
		expect(queryAtEnd(codeBlock(text(':tada')))).toBeNull();
		expect(queryAtEnd(paragraph(text('x :tada', ['code'])))).toBeNull();
	});

	test('closes once the name is typed whole, for the conversion to take over', () => {
		expect(queryAtEnd(paragraph(text(':tada:')))).toBeNull();
	});
});

const org: OrgEmoji = {
	custom: { campfire: '/files/emoji/1', tadaline: '/files/emoji/2' },
	orgName: 'Log Cabin',
	canAdd: false
};
let standard: PickerSection[];
beforeAll(async () => {
	standard = await loadEmoji();
});

describe('filterEmoji', () => {
	test('finds a standard emoji by its name', () => {
		expect(filterEmoji('thumbs', standard, org)[0].value).toBe('👍');
	});

	test('finds one by a keyword that its name lacks', () => {
		expect(filterEmoji('tad', standard, org).map((e) => e.value)).toContain('🎉');
	});

	test("lists the org's own emoji first, as :name: with their image", () => {
		const [first] = filterEmoji('tadal', standard, org);
		expect(first).toMatchObject({ value: ':tadaline:', url: '/files/emoji/2' });
		expect(filterEmoji('camp', standard, org)[0].value).toBe(':campfire:');
	});

	test('lists no more than eight', () => {
		expect(filterEmoji('face', standard, org)).toHaveLength(8);
	});
});

describe('emojiNamed', () => {
	test('is the standard emoji with that name or keyword', () => {
		expect(emojiNamed('tada')).toBe('🎉');
		expect(emojiNamed('thumbs_up')).toBe('👍');
	});

	test("is nothing for a name that isn't a standard emoji's", () => {
		expect(emojiNamed('campfire')).toBeUndefined();
	});
});
