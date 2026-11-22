import { describe, expect, test } from 'vitest';
import type { Node } from '@tiptap/pm/model';
import { documentSchema } from './extensions.js';
import { filterSlash, slashItems, slashMatch } from './slash.js';

const schema = documentSchema();
const text = (value: string, marks: string[] = []) =>
	schema.text(
		value,
		marks.map((name) => schema.marks[name].create())
	);
const paragraph = (...content: Node[]) => schema.nodes.paragraph.create(null, content);
const codeBlock = (...content: Node[]) => schema.nodes.codeBlock.create(null, content);

/** What the menu finds when the caret is at the end of `block`: the typed query, or null. */
function queryAtEnd(block: Node): string | null {
	const doc = schema.node('doc', null, [block]);
	const match = slashMatch({
		char: '/',
		allowSpaces: false,
		allowToIncludeChar: false,
		allowedPrefixes: [' '],
		startOfLine: false,
		$position: doc.resolve(block.nodeSize - 1)
	});
	return match && match.query;
}

describe('slashMatch', () => {
	test('opens at the start of a block', () => {
		expect(queryAtEnd(paragraph(text('/')))).toBe('');
		expect(queryAtEnd(paragraph(text('/h2')))).toBe('h2');
	});

	test('opens after a space', () => {
		expect(queryAtEnd(paragraph(text('Next: /quo')))).toBe('quo');
	});

	test('stays shut in the middle of a word or an address', () => {
		expect(queryAtEnd(paragraph(text('and/')))).toBeNull();
		expect(queryAtEnd(paragraph(text('and/or')))).toBeNull();
		expect(queryAtEnd(paragraph(text('see https://example.com/')))).toBeNull();
	});

	test('stays shut right after a mark ends, where the text before the caret starts at the /', () => {
		expect(queryAtEnd(paragraph(text('and', ['bold']), text('/')))).toBeNull();
		expect(queryAtEnd(paragraph(text('and ', ['bold']), text('/')))).toBe('');
	});

	test('stays shut in a code block and in inline code', () => {
		expect(queryAtEnd(codeBlock(text('/')))).toBeNull();
		expect(queryAtEnd(paragraph(text('x /', ['code'])))).toBeNull();
	});

	test('opens after a line break, which starts a line like the start of a block does', () => {
		const lineBreak = schema.nodes.hardBreak.create();
		expect(queryAtEnd(paragraph(text('Intro'), lineBreak, text('/h2')))).toBe('h2');
		expect(queryAtEnd(paragraph(text('Intro'), lineBreak, text('and/')))).toBeNull();
	});

	test('ends the query at a space', () => {
		expect(queryAtEnd(paragraph(text('/h2 ')))).toBeNull();
	});
});

describe('filterSlash', () => {
	const labels = (query: string) => filterSlash(query).map((item) => item.label);

	test('lists every item, in order, for an empty query', () => {
		expect(labels('')).toEqual([
			'Text',
			'Heading 1',
			'Heading 2',
			'Heading 3',
			'Bulleted list',
			'Numbered list',
			'Checklist',
			'Quote',
			'Code block',
			'Divider',
			'Collapsible section',
			'Time'
		]);
		expect(slashItems).toHaveLength(12);
	});

	test('finds by label, in any case', () => {
		expect(labels('HEAD')).toEqual(['Heading 1', 'Heading 2', 'Heading 3']);
		expect(labels('quote')).toEqual(['Quote']);
	});

	test('finds by alias', () => {
		expect(labels('h2')).toEqual(['Heading 2']);
		expect(labels('todo')).toEqual(['Checklist']);
		expect(labels('toggle')).toEqual(['Collapsible section']);
		expect(labels('list')).toEqual(['Bulleted list', 'Numbered list', 'Checklist']);
	});

	test('finds nothing for text no label or alias holds', () => {
		expect(labels('zzz')).toEqual([]);
	});
});
