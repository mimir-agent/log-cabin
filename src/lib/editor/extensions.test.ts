import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { sanitizeDoc, type DocNode } from './doc';
import { bodyField } from '../notes/live';
import { toggleMark } from '@tiptap/pm/commands';
import { EditorState, type Transaction } from '@tiptap/pm/state';
import { documentSchema, linkHref } from './extensions';

const text = (value: string, marks?: object[]) => ({ type: 'text', text: value, marks });
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });

describe('documentSchema', () => {
	it('carries sections, highlighted code, keys, dates and mentions of a post through a live document and back unchanged', () => {
		const body = sanitizeDoc(
			JSON.stringify({
				type: 'doc',
				content: [
					{
						type: 'details',
						content: [
							{ type: 'detailsSummary', content: [text('Packing')] },
							{
								type: 'detailsContent',
								content: [paragraph(text('Press '), text('⌘K', [{ type: 'kbd' }]))]
							}
						]
					},
					{ type: 'codeBlock', attrs: { language: 'js' }, content: [text('const a = 1;')] },
					{ type: 'codeBlock', content: [text('plain')] },
					paragraph(
						text('Meet '),
						{ type: 'relativeTime', attrs: { timestamp: Date.UTC(2026, 10, 23, 15, 0) } },
						text(' about '),
						{ type: 'resourceMention', attrs: { kind: 'post', id: '01JD5Z3W8Q9X2M4N6P7R8S9T0V' } }
					)
				]
			})
		);

		// As a note's room seeds its document from the stored body, then reloads it from a snapshot.
		const seeded = new Y.Doc();
		prosemirrorJSONToYXmlFragment(documentSchema(), body, seeded.getXmlFragment(bodyField));
		const reloaded = new Y.Doc();
		Y.applyUpdate(reloaded, Y.encodeStateAsUpdate(seeded));
		const read = yXmlFragmentToProsemirrorJSON(reloaded.getXmlFragment(bodyField)) as DocNode;

		expect(read.content?.[0].attrs ?? {}, 'no open state in the shared document').toEqual({});
		expect(sanitizeDoc(JSON.stringify(read))).toEqual(body);
	});
});

describe('the keyboard key mark', () => {
	it('marks everything typed after pressing it with nothing selected, not only the first character', () => {
		const schema = documentSchema();
		let state = EditorState.create({
			schema,
			doc: schema.node('doc', null, [schema.node('paragraph')])
		});
		const apply = (tr: Transaction) => (state = state.apply(tr));

		toggleMark(schema.marks.kbd)(state, apply);
		for (const char of 'def') apply(state.tr.insertText(char));

		expect(state.doc.firstChild!.toJSON().content).toEqual([
			{ type: 'text', text: 'def', marks: [{ type: 'kbd' }] }
		]);
	});
});

describe('linkHref', () => {
	it.each([
		['https://example.com', 'https://example.com'],
		['example.com', 'https://example.com'],
		['mailto:a@example.com', 'mailto:a@example.com']
	])('takes %s as %s', (typed, href) => expect(linkHref(typed)).toBe(href));

	it.each(['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', 'http://'])(
		'refuses %s',
		(typed) => expect(linkHref(typed)).toBeNull()
	);
});

describe('a comment’s passage in a live document', () => {
	it('keeps two comments on overlapping words through the document and back', () => {
		const [first, second] = ['01JD5Z3W8Q9X2M4N6P7R8S9T0V', '01JD5Z3W8Q9X2M4N6P7R8S9T0W'];
		const comment = (commentId: string) => ({ type: 'noteComment', attrs: { commentId } });
		const body = sanitizeDoc(
			JSON.stringify({
				type: 'doc',
				content: [
					paragraph(
						text('Walk '),
						text('the ', [comment(first)]),
						text('ridge', [comment(first), comment(second)]),
						text(' early', [comment(second)])
					)
				]
			})
		);

		const seeded = new Y.Doc();
		prosemirrorJSONToYXmlFragment(documentSchema(), body, seeded.getXmlFragment(bodyField));
		const read = yXmlFragmentToProsemirrorJSON(seeded.getXmlFragment(bodyField)) as DocNode;

		expect(sanitizeDoc(JSON.stringify(read))).toEqual(body);
	});
});
