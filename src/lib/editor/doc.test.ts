import { describe, expect, it } from 'vitest';
import {
	docAttachments,
	docMentions,
	docNoteRefs,
	docResources,
	docText,
	sanitizeDoc,
	setTaskChecked,
	taskItems,
	type DocNode
} from './doc';

const doc = (...content: object[]) => JSON.stringify({ type: 'doc', content });
const para = (...content: object[]) => ({ type: 'paragraph', content });
const id = '01M7Q500BAWZ0AFFM8HBVAAY41';

describe('sanitizeDoc', () => {
	it('keeps known nodes and drops attributes pages never render', () => {
		const out = sanitizeDoc(
			doc(
				{ type: 'heading', attrs: { level: 2, id: 'x' }, content: [{ type: 'text', text: 'Hi' }] },
				para({
					type: 'text',
					text: 'site',
					marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_self' } }]
				})
			)
		);
		expect(out.content?.[0].attrs).toEqual({ level: 2 });
		expect(out.content?.[1].content?.[0].marks).toEqual([
			{ type: 'link', attrs: { href: 'https://example.com' } }
		]);
	});

	it('rejects script links, outside images and unknown nodes, saying where', () => {
		const js = para({
			type: 'text',
			text: 'x',
			marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]
		});
		expect(() => sanitizeDoc(doc(js))).toThrow('doc.content[0].content[0].marks[0]');
		expect(() =>
			sanitizeDoc(doc({ type: 'image', attrs: { src: 'https://tracker.example/p.gif' } }))
		).toThrow('expected an uploaded image');
		expect(() => sanitizeDoc(doc({ type: 'iframe' }))).toThrow('got "iframe"');
		expect(() => sanitizeDoc('not json')).toThrow('expected the body to be JSON');
	});

	it('keeps a date and time only as whole milliseconds, and reads it as the date in UTC', () => {
		const at = (timestamp: unknown) => doc(para({ type: 'relativeTime', attrs: { timestamp } }));
		const kept = sanitizeDoc(at(Date.UTC(2026, 10, 23, 15, 0)));
		expect(kept.content?.[0].content?.[0]).toEqual({
			type: 'relativeTime',
			attrs: { timestamp: Date.UTC(2026, 10, 23, 15, 0) }
		});
		expect(docText(kept)).toBe('Monday, November 23, 2026 at 3:00 PM UTC');
		for (const timestamp of ['1700000000000', 1.5, null, Number.NaN]) {
			expect(() => sanitizeDoc(at(timestamp)), `refuses ${timestamp}`).toThrow(
				'expected a timestamp in whole milliseconds at doc.content[0].content[0]'
			);
		}
	});

	it('keeps a mention of a note, post or call only by kind and id, never a title', () => {
		const mention = (attrs: object) => doc(para({ type: 'resourceMention', attrs }));
		const kept = sanitizeDoc(mention({ kind: 'post', id, title: 'Budget' }));
		expect(kept.content?.[0].content?.[0], 'the title is dropped').toEqual({
			type: 'resourceMention',
			attrs: { kind: 'post', id }
		});
		expect(docText(kept), 'search and previews never hold a title').toBe('a linked thread');
		for (const kind of ['note', 'call'] as const) {
			expect(docText(sanitizeDoc(mention({ kind, id }))), kind).toBe(
				`a linked ${kind === 'note' ? 'doc' : kind}`
			);
		}
		for (const attrs of [{ kind: 'project', id }, { kind: 'note', id: '../x' }, { kind: 'call' }]) {
			expect(() => sanitizeDoc(mention(attrs)), JSON.stringify(attrs)).toThrow(
				'expected a note, post or call and its id at doc.content[0].content[0]'
			);
		}
	});
});

it('extracts plain text, mentions and attachments for search and events', () => {
	const parsed = sanitizeDoc(
		doc(
			para({ type: 'text', text: 'Ask ' }, { type: 'mention', attrs: { id: 'u1', label: 'Ada' } }),
			{ type: 'image', attrs: { src: `/files/attachments/${id}`, alt: 'chart' } },
			{ type: 'attachment', attrs: { id: 'A2', name: 'notes.pdf', size: 10 } }
		)
	);
	expect(docText(parsed)).toBe('Ask @Ada\n\nnotes.pdf');
	expect(docMentions(parsed)).toEqual(['u1']);
	expect(docAttachments(parsed)).toEqual([id, 'A2']);
});

it('finds the notes a document links to, on any origin, each once', () => {
	const link = (href: string) => ({
		type: 'text',
		text: href,
		marks: [{ type: 'bold' }, { type: 'link', attrs: { href } }]
	});
	const parsed = {
		type: 'doc',
		content: [
			para(
				link('https://campfire.example/notes/N1'),
				link('http://elsewhere.example/notes/N2/?tab=comments#c1'),
				link('/notes/N3')
			),
			para(
				link('https://campfire.example/notes/N1'),
				link('https://campfire.example/notes'),
				link('https://campfire.example/notes/N4/history'),
				link('https://campfire.example/posts/P1'),
				link('mailto:ada@example.com'),
				link('http://[')
			)
		]
	} as DocNode;
	expect(docNoteRefs(parsed), 'only paths that are a note page').toEqual(['N1', 'N2', 'N3']);
});

it('finds the notes a document mentions with @ among the notes it refers to, and every mention', () => {
	const mention = (kind: string, target: string) => ({
		type: 'resourceMention',
		attrs: { kind, id: target }
	});
	const parsed = {
		type: 'doc',
		content: [
			para(mention('note', 'N1'), mention('post', 'P1'), mention('call', 'C1')),
			para(mention('note', 'N1'), {
				type: 'text',
				text: 'plan',
				marks: [{ type: 'link', attrs: { href: '/notes/N2' } }]
			})
		]
	} as DocNode;
	expect(docNoteRefs(parsed), 'only notes, each once').toEqual(['N1', 'N2']);
	expect(docResources(parsed)).toEqual([
		{ kind: 'note', id: 'N1' },
		{ kind: 'post', id: 'P1' },
		{ kind: 'call', id: 'C1' }
	]);
});

describe('task items', () => {
	const item = (text: string, checked: unknown) => ({
		type: 'taskItem',
		attrs: { checked },
		content: [para({ type: 'text', text })]
	});

	it('keeps checked only as a boolean and reads each item as a line', () => {
		const out = sanitizeDoc(
			doc({ type: 'taskList', content: [item('a', 'yes'), item('b', true)] })
		);
		expect(out.content?.[0].content?.map((i) => i.attrs)).toEqual([
			{ checked: false },
			{ checked: true }
		]);
		expect(docText(out)).toBe('a\nb');
	});

	it('ticks the index-th item counting nested lists in reading order', () => {
		const nested = {
			...item('a', false),
			content: [
				para({ type: 'text', text: 'a' }),
				{ type: 'taskList', content: [item('a1', false)] }
			]
		};
		const body = sanitizeDoc(doc({ type: 'taskList', content: [nested, item('b', false)] }));
		const out = setTaskChecked(body, 1, true);
		expect(taskItems(out).map((i) => i.attrs?.checked)).toEqual([false, true, false]);
		expect(() => setTaskChecked(body, 3, true)).toThrow(/index 3/);
	});
});

describe('collapsible sections', () => {
	const section = (attrs?: object) => ({
		type: 'details',
		attrs,
		content: [
			{ type: 'detailsSummary', content: [{ type: 'text', text: 'Packing' }] },
			{ type: 'detailsContent', content: [para({ type: 'text', text: 'Tent' }), para()] }
		]
	});

	it('keeps a section but never whether someone had it open', () => {
		const out = sanitizeDoc(doc(section({ open: true })));
		expect(out.content?.[0], 'no open state in the stored section').toEqual(
			sanitizeDoc(doc(section())).content?.[0]
		);
		expect(out.content?.[0].attrs).toBeUndefined();
	});

	it('reads a section as its title, then its body, a line each', () => {
		expect(docText(sanitizeDoc(doc(section(), para({ type: 'text', text: 'After' }))))).toBe(
			'Packing\nTent\n\nAfter'
		);
	});
});

describe('code blocks', () => {
	const code = (language: unknown) => ({
		type: 'codeBlock',
		attrs: { language },
		content: [{ type: 'text', text: 'const a = 1;' }]
	});

	it('keeps a short lower-case language, or none', () => {
		expect(sanitizeDoc(doc(code('c++'))).content?.[0].attrs).toEqual({ language: 'c++' });
		expect(sanitizeDoc(doc(code(null))).content?.[0].attrs).toBeUndefined();
		expect(docText(sanitizeDoc(doc(code('js'))))).toBe('const a = 1;');
	});

	it('lower-cases a language and drops one it still cannot keep, so older bodies still save', () => {
		const attrs = (language: unknown) => sanitizeDoc(doc(code(language))).content?.[0].attrs;
		expect(attrs('JavaScript'), 'lower-cased').toEqual({ language: 'javascript' });
		expect(attrs('js" onload="x'), 'dropped').toBeUndefined();
		expect(attrs('x'.repeat(33)), 'dropped').toBeUndefined();
	});
});

it('keeps a keyboard key mark without attributes and reads its text plainly', () => {
	const out = sanitizeDoc(
		doc(
			para(
				{ type: 'text', text: 'Press ' },
				{ type: 'text', text: '⌘K', marks: [{ type: 'kbd', attrs: { title: 'x' } }] }
			)
		)
	);
	expect(out.content?.[0].content?.[1].marks).toEqual([{ type: 'kbd' }]);
	expect(docText(out)).toBe('Press ⌘K');
});

describe('a comment’s passage in a note', () => {
	const marked = (...marks: object[]) => doc(para({ type: 'text', text: 'the ridge', marks }));

	it('keeps a comment mark that names a comment by its id', () => {
		const out = sanitizeDoc(marked({ type: 'noteComment', attrs: { commentId: id } }));
		expect(out.content?.[0].content?.[0].marks).toEqual([
			{ type: 'noteComment', attrs: { commentId: id } }
		]);
	});

	it('keeps two comments on the same words', () => {
		const other = '01M7Q500BAWZ0AFFM8HBVAAY42';
		const out = sanitizeDoc(
			marked(
				{ type: 'noteComment', attrs: { commentId: id } },
				{ type: 'noteComment', attrs: { commentId: other } }
			)
		);
		expect(out.content?.[0].content?.[0].marks).toHaveLength(2);
	});

	it('refuses a comment mark without an id, with another id, or with anything more', () => {
		const refused = (attrs: object | undefined) => () =>
			sanitizeDoc(marked({ type: 'noteComment', attrs }));
		expect(refused(undefined), 'no id').toThrow('comment id');
		expect(refused({ commentId: 'not-an-id' }), 'not a ULID').toThrow('comment id');
		expect(refused({ commentId: id, author: 'Ada' }), 'another attribute').toThrow('comment id');
	});
});
