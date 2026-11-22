import { describe, expect, it } from 'vitest';
import { sanitizeDoc, type DocNode } from './doc';
import { documentSchema } from './extensions';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { parseMarkdownPaste, pasteSlice, vscodePaste } from './markdown-paste';

const id = '01JD5Z3W8Q9X2M4N6P7R8S9T0V';
const text = (value: string, ...marks: string[]) => ({
	type: 'text',
	text: value,
	...(marks.length && { marks: marks.map((type) => ({ type })) })
});
const link = (value: string, href: string) => ({
	type: 'text',
	text: value,
	marks: [{ type: 'link', attrs: { href } }]
});
const paragraph = (...content: object[]) => ({ type: 'paragraph', content });
const heading = (level: number, ...content: object[]) => ({
	type: 'heading',
	attrs: { level },
	content
});
const bullet = (...content: object[]) => ({ type: 'listItem', content });
const task = (checked: boolean, ...content: object[]) => ({
	type: 'taskItem',
	attrs: { checked },
	content
});

const everything = new Set(Object.keys(documentSchema().nodes));
const chat = new Set([...everything].filter((name) => !['taskList', 'taskItem'].includes(name)));

/** The blocks a paste stands for in an editor with these node types, or null when it holds no Markdown. */
const blocksOf = (
	pasted: string,
	imported?: ReadonlyMap<string, string>,
	nodes: ReadonlySet<string> = everything
) => parseMarkdownPaste(pasted, nodes)?.blocks(imported) ?? null;

describe('headings', () => {
	it('turns # to ### into headings of those levels, and deeper levels into level 3', () => {
		expect(blocksOf('# One\n## Two\n### Three\n#### Four\n###### Six')).toEqual([
			heading(1, text('One')),
			heading(2, text('Two')),
			heading(3, text('Three')),
			heading(3, text('Four')),
			heading(3, text('Six'))
		]);
	});

	it('leaves #tags, and a # without a space, as text', () => {
		expect(blocksOf('#tag\n#42 issues')).toBeNull();
	});

	it('marks the text inside a heading', () => {
		expect(blocksOf('## The **big** day')).toEqual([
			heading(2, text('The '), text('big', 'bold'), text(' day'))
		]);
	});
});

describe('lists', () => {
	it('turns -, * and + lines into bullet items', () => {
		expect(blocksOf('- one\n* two\n+ three')).toEqual([
			{
				type: 'bulletList',
				content: [
					bullet(paragraph(text('one'))),
					bullet(paragraph(text('two'))),
					bullet(paragraph(text('three')))
				]
			}
		]);
	});

	it('numbers a list from its first number', () => {
		expect(blocksOf('1. first\n2. second')).toEqual([
			{
				type: 'orderedList',
				content: [bullet(paragraph(text('first'))), bullet(paragraph(text('second')))]
			}
		]);
		expect(blocksOf('3. third\n4. fourth')?.[0].attrs).toEqual({ start: 3 });
	});

	it('starts a new list where the kind changes', () => {
		expect(blocksOf('- a\n1. b\n- [ ] c')?.map((block) => block.type)).toEqual([
			'bulletList',
			'orderedList',
			'taskList'
		]);
	});

	it.each([
		['two spaces', '  '],
		['four spaces', '    '],
		['a tab', '\t']
	])('nests an item indented by %s', (_, indent) => {
		expect(blocksOf(`- one\n${indent}- inner\n${indent}${indent}1. deepest\n- two`)).toEqual([
			{
				type: 'bulletList',
				content: [
					bullet(paragraph(text('one')), {
						type: 'bulletList',
						content: [
							bullet(paragraph(text('inner')), {
								type: 'orderedList',
								content: [bullet(paragraph(text('deepest')))]
							})
						]
					}),
					bullet(paragraph(text('two')))
				]
			}
		]);
	});

	it('keeps a list going over a blank line, and ends it at a line that is not indented', () => {
		expect(blocksOf('- a\n\n- b\nplain')?.map((block) => block.type)).toEqual([
			'bulletList',
			'paragraph'
		]);
		expect((blocksOf('- a\n\n- b')?.[0].content ?? []).length).toBe(2);
		expect(blocksOf('- a\n\nplain\n- b')?.map((block) => block.type)).toEqual([
			'bulletList',
			'paragraph',
			'bulletList'
		]);
	});

	it('holds blocks nested under an item', () => {
		expect(blocksOf('- step\n  ```sh\n  ls\n  ```\n  > note')).toEqual([
			{
				type: 'bulletList',
				content: [
					bullet(
						paragraph(text('step')),
						{ type: 'codeBlock', attrs: { language: 'sh' }, content: [text('ls')] },
						{ type: 'blockquote', content: [paragraph(text('note'))] }
					)
				]
			}
		]);
	});

	it('leaves a line that only starts like an item as text', () => {
		expect(blocksOf('-nothing\n1.5 litres')).toBeNull();
	});
});

describe('tasks', () => {
	it('turns - [ ] and - [x], and [ ] and [x] alone, into task items', () => {
		expect(blocksOf('- [ ] open\n- [x] done\n[ ] bare open\n[X] bare done')).toEqual([
			{
				type: 'taskList',
				content: [
					task(false, paragraph(text('open'))),
					task(true, paragraph(text('done'))),
					task(false, paragraph(text('bare open'))),
					task(true, paragraph(text('bare done')))
				]
			}
		]);
	});

	it('nests tasks, and lists in tasks', () => {
		expect(blocksOf('- [ ] outer\n  - [x] inner\n  - plain')).toEqual([
			{
				type: 'taskList',
				content: [
					task(
						false,
						paragraph(text('outer')),
						{ type: 'taskList', content: [task(true, paragraph(text('inner')))] },
						{ type: 'bulletList', content: [bullet(paragraph(text('plain')))] }
					)
				]
			}
		]);
	});
});

describe('quotes', () => {
	it('joins lines starting with > into one quote of paragraphs', () => {
		expect(blocksOf('> one\n> two\n\n>three')).toEqual([
			{ type: 'blockquote', content: [paragraph(text('one')), paragraph(text('two'))] },
			{ type: 'blockquote', content: [paragraph(text('three'))] }
		]);
	});

	it('holds blocks, and quotes, inside a quote', () => {
		expect(blocksOf('> # Title\n> - a\n> - b\n>\n> > deeper\n> ```js\n> x\n> ```')).toEqual([
			{
				type: 'blockquote',
				content: [
					heading(1, text('Title')),
					{
						type: 'bulletList',
						content: [bullet(paragraph(text('a'))), bullet(paragraph(text('b')))]
					},
					{ type: 'blockquote', content: [paragraph(text('deeper'))] },
					{ type: 'codeBlock', attrs: { language: 'js' }, content: [text('x')] }
				]
			}
		]);
	});

	it('keeps an empty quote as a quote with an empty paragraph', () => {
		expect(blocksOf('>')).toEqual([{ type: 'blockquote', content: [{ type: 'paragraph' }] }]);
	});
});

describe('code fences', () => {
	it('turns a fence into a code block in its language, lines around it into paragraphs', () => {
		expect(blocksOf('Set up:\r\n```JS\nconst a = 1;\n\nlog(a);\n```\n\nDone.')).toEqual([
			paragraph(text('Set up:')),
			{ type: 'codeBlock', attrs: { language: 'js' }, content: [text('const a = 1;\n\nlog(a);')] },
			paragraph(text('Done.'))
		]);
	});

	it('keeps a fence without a language, or with one sanitizeDoc would drop, as plain code', () => {
		expect(blocksOf('```\nls\n```')).toEqual([
			{ type: 'codeBlock', attrs: { language: null }, content: [text('ls')] }
		]);
		expect(blocksOf('```{weird}\nx\n```')?.[0].attrs).toEqual({ language: null });
		expect(blocksOf('```js\n```')).toEqual([{ type: 'codeBlock', attrs: { language: 'js' } }]);
	});

	it('leaves everything inside a fence as typed, whatever it looks like', () => {
		expect(blocksOf('```md\n# not a heading\n- not **bold** [a](https://x.example)\n```')).toEqual([
			{
				type: 'codeBlock',
				attrs: { language: 'md' },
				content: [text('# not a heading\n- not **bold** [a](https://x.example)')]
			}
		]);
	});

	it('leaves an unclosed fence as text', () => {
		expect(blocksOf('```js\nconst a = 1;')).toBeNull();
	});
});

describe('dividers', () => {
	it('turns --- and *** lines into dividers', () => {
		expect(blocksOf('above\n---\n***\n-----\nbelow')?.map((block) => block.type)).toEqual([
			'paragraph',
			'horizontalRule',
			'horizontalRule',
			'horizontalRule',
			'paragraph'
		]);
	});
});

describe('inline Markdown', () => {
	it('marks bold, italic, code, strike and links in a line', () => {
		expect(
			blocksOf(
				'**b** __b2__ *i* _i2_ `c` ~~s~~ [link](https://example.com) and [mail](mailto:a@b.example)'
			)
		).toEqual([
			paragraph(
				text('b', 'bold'),
				text(' '),
				text('b2', 'bold'),
				text(' '),
				text('i', 'italic'),
				text(' '),
				text('i2', 'italic'),
				text(' '),
				text('c', 'code'),
				text(' '),
				text('s', 'strike'),
				text(' '),
				link('link', 'https://example.com'),
				text(' and '),
				link('mail', 'mailto:a@b.example')
			)
		]);
	});

	it('nests marks, and marks a link’s text', () => {
		expect(blocksOf('**bold _and italic_** [*go*](https://example.com)')).toEqual([
			paragraph(
				text('bold ', 'bold'),
				{ type: 'text', text: 'and italic', marks: [{ type: 'bold' }, { type: 'italic' }] },
				text(' '),
				{
					type: 'text',
					text: 'go',
					marks: [{ type: 'link', attrs: { href: 'https://example.com' } }, { type: 'italic' }]
				}
			)
		]);
	});

	it('marks inside lists, tasks and quotes', () => {
		const [list, tasks, quote] = blocksOf('- a **b**\n\n- [ ] c `d`\n\n> e ~~f~~') as DocNode[];
		expect(list.content?.[0].content?.[0]).toEqual(paragraph(text('a '), text('b', 'bold')));
		expect(tasks.content?.[0].content?.[0]).toEqual(paragraph(text('c '), text('d', 'code')));
		expect(quote.content?.[0]).toEqual(paragraph(text('e '), text('f', 'strike')));
	});

	it('leaves text that only looks like a span alone', () => {
		expect(blocksOf('snake_case_name and 2 * 3 * 4 and a_b')).toBeNull();
		expect(blocksOf('**open and `open and ~~open')).toBeNull();
	});

	it('does not read what is inside a code span', () => {
		expect(blocksOf('`**not bold**`')).toEqual([paragraph(text('**not bold**', 'code'))]);
	});

	it('leaves a link to anything but http, https or mailto as text', () => {
		expect(blocksOf('[click](javascript:alert(1))')).toBeNull();
		expect(blocksOf('[file](file:///etc/passwd) and [data](data:text/html,x)')).toBeNull();
		expect(blocksOf('[rel](/projects/x) and [odd](https://)')).toBeNull();
		expect(blocksOf('**[click](javascript:alert(1))**')).toEqual([
			paragraph(text('[click](javascript:alert(1))', 'bold'))
		]);
	});
});

describe('images', () => {
	it('inserts an image from one of our own attachment paths as an image block', () => {
		expect(blocksOf(`Our tent ![tent](/files/attachments/${id}) at dusk`)).toEqual([
			paragraph(text('Our tent ')),
			{ type: 'image', attrs: { src: `/files/attachments/${id}`, alt: 'tent' } },
			paragraph(text(' at dusk'))
		]);
	});

	it('links to an image anywhere else, named by its alt text, since only our own are stored', () => {
		expect(
			blocksOf('See ![the map](https://maps.example/a.png "Map") and ![](https://x.example/b.png)')
		).toEqual([
			paragraph(
				text('See '),
				link('the map', 'https://maps.example/a.png'),
				text(' and '),
				link('https://x.example/b.png', 'https://x.example/b.png')
			)
		]);
		expect(blocksOf('![x](javascript:alert(1))'), 'left as text').toBeNull();
	});

	it('lists each web image once for fetching into the note, but not our own or those inside code', () => {
		expect(
			parseMarkdownPaste(
				[
					'![map](https://maps.example/a.png) and ![](http://x.example/b.png)',
					`![tent](/files/attachments/${id}) ![again](https://maps.example/a.png)`,
					'```md',
					'![in code](https://code.example/c.png)',
					'```',
					'![x](javascript:alert(1))'
				].join('\n'),
				everything
			)?.web
		).toEqual(['https://maps.example/a.png', 'http://x.example/b.png']);
		expect(parseMarkdownPaste(`![tent](/files/attachments/${id})`, everything)?.web).toEqual([]);
	});

	it('inserts a fetched web image as an image block at its place, and links to one that wasn’t', () => {
		const imported = new Map([['https://maps.example/a.png', `/files/attachments/${id}`]]);
		expect(
			blocksOf(
				'Route ![map](https://maps.example/a.png) then ![view](https://x.example/b.png)',
				imported
			)
		).toEqual([
			paragraph(text('Route ')),
			{ type: 'image', attrs: { src: `/files/attachments/${id}`, alt: 'map' } },
			paragraph(text(' then '), link('view', 'https://x.example/b.png'))
		]);
	});
});

describe('a mixed paste', () => {
	it('converts the blocks and the marks outside a fence, and nothing inside it', () => {
		expect(
			blocksOf(
				[
					'# Plan',
					'Bring **tea** and `rope`.',
					'',
					'```sh',
					'echo **not bold**',
					'```',
					'- [ ] pack',
					'> see [map](https://maps.example)',
					'---'
				].join('\n')
			)
		).toEqual([
			heading(1, text('Plan')),
			paragraph(
				text('Bring '),
				text('tea', 'bold'),
				text(' and '),
				text('rope', 'code'),
				text('.')
			),
			{ type: 'codeBlock', attrs: { language: 'sh' }, content: [text('echo **not bold**')] },
			{ type: 'taskList', content: [task(false, paragraph(text('pack')))] },
			{
				type: 'blockquote',
				content: [paragraph(text('see '), link('map', 'https://maps.example'))]
			},
			{ type: 'horizontalRule' }
		]);
	});

	it('gives a paste with every block syntax its blocks', () => {
		const blocks = blocksOf(
			[
				'# Title',
				'## Sub',
				'- one',
				'1. first',
				'- [ ] task',
				'> quoted',
				'```js',
				'const a = 1;',
				'```',
				'**bold** _it_ `code` ~~gone~~ [link](https://example.com)',
				'---'
			].join('\n')
		);
		expect(blocks?.map((block) => block.type)).toEqual([
			'heading',
			'heading',
			'bulletList',
			'orderedList',
			'taskList',
			'blockquote',
			'codeBlock',
			'paragraph',
			'horizontalRule'
		]);
	});

	it('produces only what sanitizeDoc stores', () => {
		const nodes = blocksOf(
			[
				'# H',
				'- a **b** [c](https://example.com)',
				'  1. d',
				'- [x] e',
				'> f',
				'```c++',
				'int main();',
				'```',
				'---',
				`![a](/files/attachments/${id})`,
				'![b](https://example.com/b.png)'
			].join('\n')
		);
		expect(() => sanitizeDoc(JSON.stringify({ type: 'doc', content: nodes }))).not.toThrow();
	});
});

describe('code pasted from a code editor', () => {
	it('is a code block in the editor’s mode when it spans lines, whatever it looks like', () => {
		expect(vscodePaste('# a comment\r\n- **x** = 1;', 'TypeScript')).toEqual({
			type: 'codeBlock',
			attrs: { language: 'typescript' },
			content: [text('# a comment\n- **x** = 1;')]
		});
	});

	it('keeps a mode sanitizeDoc would drop as plain code', () => {
		expect(vscodePaste('a\nb', 'not a mode!').attrs).toEqual({ language: null });
	});

	it('is inline code when it is one line', () => {
		expect(vscodePaste('**x** = 1;', 'typescript')).toEqual(text('**x** = 1;', 'code'));
	});

	it('produces only what sanitizeDoc stores', () => {
		const nodes = [vscodePaste('a\nb', 'python'), paragraph(vscodePaste('a', 'python'))];
		expect(() => sanitizeDoc(JSON.stringify({ type: 'doc', content: nodes }))).not.toThrow();
	});
});

describe('text with no Markdown', () => {
	it('is left to the editor’s own paste', () => {
		expect(blocksOf('Just words\nover two lines\n\nand a paragraph')).toBeNull();
		expect(blocksOf('https://example.com/a_b_c')).toBeNull();
		expect(blocksOf('')).toBeNull();
	});
});

describe('an editor that lacks a node type', () => {
	const paste = '# Title\n- [ ] task\n  - [x] inner\n> quoted\n---';

	it('keeps a task as a bullet item where tasks are left out, as chat saves them', () => {
		expect(blocksOf(paste, undefined, chat)).toEqual([
			heading(1, text('Title')),
			{
				type: 'bulletList',
				content: [
					bullet(paragraph(text('task')), {
						type: 'bulletList',
						content: [bullet(paragraph(text('inner')))]
					})
				]
			},
			{ type: 'blockquote', content: [paragraph(text('quoted'))] },
			{ type: 'horizontalRule' }
		]);
	});

	it('makes a paragraph with its text of any other type it lacks', () => {
		const plain = new Set(['doc', 'paragraph', 'text', 'bulletList', 'listItem']);
		expect(blocksOf('# Title\n- a\n> quoted\n```js\nx = 1\n```\n---', undefined, plain)).toEqual([
			paragraph(text('Title')),
			{ type: 'bulletList', content: [bullet(paragraph(text('a')))] },
			paragraph(text('quoted')),
			paragraph(text('x = 1')),
			{ type: 'paragraph' }
		]);
	});
});

describe('pasteSlice', () => {
	const schema = documentSchema();
	/** "Hello world" with `markdown` pasted between "Hello " and "world". */
	const pasteIntoLine = (markdown: string) => {
		const doc = schema.nodeFromJSON({ type: 'doc', content: [paragraph(text('Hello world'))] });
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 7) });
		const blocks = parseMarkdownPaste(markdown, everything)!.blocks();
		return state.apply(state.tr.replaceSelection(pasteSlice(schema, blocks)));
	};
	const lines = (state: EditorState) =>
		state.doc.children.map((node) => `${node.type.name}:${node.textContent}`);

	it('joins one paragraph to the line around the cursor, marks and links kept', () => {
		const state = pasteIntoLine('see **this** and [a link](https://x.com)');
		expect(lines(state)).toEqual(['paragraph:Hello see this and a linkworld']);
		const parts: unknown[] = [];
		state.doc.descendants((node) => {
			if (node.isText) parts.push([node.text, node.marks.map((mark) => mark.type.name)]);
		});
		expect(parts).toEqual([
			['Hello see ', []],
			['this', ['bold']],
			[' and ', []],
			['a link', ['link']],
			['world', []]
		]);
	});

	it('joins the first and last paragraphs to the line and sets other blocks in whole', () => {
		const state = pasteIntoLine('start **x**\n# Head\nend **y**');
		expect(lines(state)).toEqual([
			'paragraph:Hello start x',
			'heading:Head',
			'paragraph:end yworld'
		]);
	});

	it('leaves the line whole around a block that is not a paragraph', () => {
		const state = pasteIntoLine('# Head');
		expect(lines(state)).toEqual(['paragraph:Hello ', 'heading:Head', 'paragraph:world']);
	});
});

describe('pasteSlice into an empty line', () => {
	it('takes the place of the line', () => {
		const schema = documentSchema();
		const doc = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph' }] });
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
		const blocks = parseMarkdownPaste('# Head\n- one', everything)!.blocks();
		const pasted = state.apply(state.tr.replaceSelection(pasteSlice(schema, blocks)));
		expect(pasted.doc.children.map((node) => node.type.name)).toEqual(['heading', 'bulletList']);
	});
});
