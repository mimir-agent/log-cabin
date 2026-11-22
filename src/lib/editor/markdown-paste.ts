// Plain text pasted as Markdown, as the blocks and marks it stands for: headings, lists, tasks,
// quotes, code fences, dividers, images and links, and **bold** _italic_ `code` ~~strike~~
// inside them. Text with none of that is left to the editor's own paste.
import { Fragment, Slice, type Schema } from '@tiptap/pm/model';
import {
	docText,
	isAttachmentPath,
	isCodeLanguage,
	isSafeHref,
	type DocMark,
	type DocNode
} from './doc';

const fenceOpen = /^\s*```\s*([^\s`]*)[^`]*$/;
const fenceClose = /^\s*```\s*$/;
const image = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const webAddress = /^https?:\/\//i;
const heading = /^\s*(#{1,6})\s+(\S.*)$/;
const divider = /^\s*(?:-{3,}|\*{3,})\s*$/;
const quote = /^\s*>\s?(.*)$/;
// A list item has a bullet or number, a [ ] box, or both: `- a`, `2. b`, `- [x] c`, `[ ] d`.
const listLine = /^\s*(?:([-*+]|\d+\.)\s+)?(?:\[([ xX])\]\s+)?(\S.*)$/;
const linkOrImage = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/y;
const codeSpan = /`([^`]+)`/y;

/** Web images fetched into the note: each address and the attachment path it was stored at. */
export type ImportedImages = ReadonlyMap<string, string>;

const indentOf = (line: string) => line.length - line.trimStart().length;

/** The line as a list item, or null when it has neither a bullet or number nor a box. */
function itemOf(line: string): { marker?: string; checked?: boolean; head: string } | null {
	const match = listLine.exec(line);
	if (!match || !(match[1] || match[2])) return null;
	return {
		marker: match[1],
		checked: match[2] === undefined ? undefined : match[2] !== ' ',
		head: match[3]
	};
}

/** The lines with their common indent removed. */
function dedent(lines: string[]): string[] {
	const common = Math.min(...lines.filter((line) => line.trim()).map(indentOf));
	return lines.map((line) => line.slice(Math.min(common, indentOf(line))));
}

function codeBlock(code: string, language: string): DocNode {
	return {
		type: 'codeBlock',
		attrs: { language: isCodeLanguage(language) ? language : null },
		...(code && { content: [{ type: 'text', text: code }] })
	};
}

type Run = { text: string; marks: DocMark[] };

const spans: [string, string][] = [
	['**', 'bold'],
	['__', 'bold'],
	['~~', 'strike'],
	['*', 'italic'],
	['_', 'italic']
];

const wordCharacter = /[\p{L}\p{N}]/u;

/** Whether `delimiter` at `at` may open a span: not before a space, and `_` not inside a word. */
function opens(source: string, at: number, delimiter: string): boolean {
	const after = source[at + delimiter.length];
	if (after === undefined || /\s/.test(after)) return false;
	if (delimiter.length === 1 && after === delimiter) return false;
	return delimiter[0] !== '_' || !wordCharacter.test(source[at - 1] ?? '');
}

/** Where the span `delimiter` opened at `from` ends, or -1: the next one not after a space. */
function closes(source: string, from: number, delimiter: string): number {
	const [first] = delimiter;
	let at = source.indexOf(delimiter, from + delimiter.length + 1);
	for (; at !== -1; at = source.indexOf(delimiter, at + 1)) {
		const [before, after] = [source[at - 1], source[at + delimiter.length]];
		if (/\s/.test(before)) continue;
		if (delimiter.length === 1 && (before === first || after === first)) continue;
		if (first === '_' && after !== undefined && wordCharacter.test(after)) continue;
		return at;
	}
	return -1;
}

/** Appends the text of `source` to `runs`, each run's marks being `marks` and what its spans add. */
function readInline(source: string, marks: DocMark[], runs: Run[]) {
	const add = (text: string, using: DocMark[]) => {
		const last = runs.at(-1);
		if (last && JSON.stringify(last.marks) === JSON.stringify(using)) last.text += text;
		else runs.push({ text, marks: using });
	};
	let at = 0;
	next: while (at < source.length) {
		codeSpan.lastIndex = at;
		const code = codeSpan.exec(source);
		if (code) {
			// Code excludes every other mark.
			add(code[1], [{ type: 'code' }]);
			at += code[0].length;
			continue;
		}
		linkOrImage.lastIndex = at;
		const link = linkOrImage.exec(source);
		if (link) {
			const [whole, bang, label, href] = link;
			if (!isSafeHref(href)) add(whole, marks);
			else if (bang) add(label || href, [...marks, { type: 'link', attrs: { href } }]);
			else readInline(label || href, [...marks, { type: 'link', attrs: { href } }], runs);
			at += whole.length;
			continue;
		}
		for (const [delimiter, type] of spans) {
			if (!source.startsWith(delimiter, at) || !opens(source, at, delimiter)) continue;
			const end = closes(source, at, delimiter);
			if (end === -1) continue;
			readInline(source.slice(at + delimiter.length, end), [...marks, { type }], runs);
			at = end + delimiter.length;
			continue next;
		}
		add(source[at++], marks);
	}
}

/** The text nodes for a line's inline Markdown. */
function inlineNodes(source: string): DocNode[] {
	const runs: Run[] = [];
	readInline(source, [], runs);
	return runs.map(({ text, marks }) => ({ type: 'text', text, ...(marks.length && { marks }) }));
}

const paragraph = (source: string): DocNode => ({
	type: 'paragraph',
	content: inlineNodes(source)
});

type Context = { imported: ImportedImages; web: Set<string> };

/** A line with its ![images]: paragraphs around each image, or a link in place of it. */
function lineBlocks(line: string, { imported, web }: Context): DocNode[] {
	// Only images we can show or link to; any other ![…](…) stays text.
	const images = [...line.matchAll(image)].filter(
		([, , src]) => isAttachmentPath(src) || webAddress.test(src)
	);
	const blocks: DocNode[] = [];
	let inline = '';
	// A line of only spaces isn't a paragraph, as in the editor's own plain-text paste.
	const flush = () => {
		if (inline.trim()) blocks.push(paragraph(inline));
		inline = '';
	};
	let at = 0;
	for (const match of images) {
		const [whole, alt, src] = match;
		const path = isAttachmentPath(src) ? src : imported.get(src);
		if (webAddress.test(src)) web.add(src);
		inline += line.slice(at, match.index);
		if (path) {
			flush();
			blocks.push({ type: 'image', attrs: { src: path, alt } });
		} else inline += whole;
		at = match.index + whole.length;
	}
	inline += line.slice(at);
	flush();
	return blocks;
}

type Kind = 'task' | 'ordered' | 'bullet';
type Item = NonNullable<ReturnType<typeof itemOf>> & { rest: string[] };

const listTypes: Record<Kind, string> = {
	task: 'taskList',
	ordered: 'orderedList',
	bullet: 'bulletList'
};

const kindOf = (item: Item): Kind =>
	item.checked !== undefined
		? 'task'
		: item.marker && /\d/.test(item.marker)
			? 'ordered'
			: 'bullet';

/** The items of the list that starts at `lines[from]`, with the lines nested under each, and where it ends. */
function listItems(lines: string[], from: number): [Item[], number] {
	const base = indentOf(lines[from]);
	const items: Item[] = [];
	let at = from;
	for (; at < lines.length; at++) {
		const line = lines[at];
		const last = items.at(-1);
		if (!line.trim()) {
			// A blank line belongs to the list only if the list goes on after it.
			const next = lines.slice(at).find((other) => other.trim());
			const goesOn =
				next !== undefined &&
				(indentOf(next) > base || (indentOf(next) === base && itemOf(next) !== null));
			if (!last || !goesOn) break;
			last.rest.push(line);
		} else if (last && indentOf(line) > base) {
			last.rest.push(line);
		} else {
			const item = itemOf(line);
			if (!item || indentOf(line) !== base) break;
			items.push({ ...item, rest: [] });
		}
	}
	return [items, at];
}

/** The lists for a run of items: a new one wherever the kind (bullet, number, task) changes. */
function lists(items: Item[], context: Context): DocNode[] {
	const out: DocNode[] = [];
	for (let at = 0; at < items.length;) {
		const kind = kindOf(items[at]);
		let end = at;
		while (end < items.length && kindOf(items[end]) === kind) end++;
		const start = parseInt(items[at].marker ?? '1');
		out.push({
			type: listTypes[kind],
			...(kind === 'ordered' && start !== 1 && { attrs: { start } }),
			content: items.slice(at, end).map((item) => ({
				type: kind === 'task' ? 'taskItem' : 'listItem',
				...(kind === 'task' && { attrs: { checked: item.checked } }),
				content: [paragraph(item.head), ...blocksOf(dedent(item.rest), context)]
			}))
		});
		at = end;
	}
	return out;
}

function blocksOf(lines: string[], context: Context): DocNode[] {
	const blocks: DocNode[] = [];
	let at = 0;
	while (at < lines.length) {
		const line = lines[at];
		const open = fenceOpen.exec(line);
		const close = open ? lines.findIndex((other, i) => i > at && fenceClose.test(other)) : -1;
		const head = heading.exec(line);
		if (!line.trim()) {
			at++;
		} else if (open && close !== -1) {
			blocks.push(codeBlock(lines.slice(at + 1, close).join('\n'), open[1].toLowerCase()));
			at = close + 1;
		} else if (divider.test(line)) {
			blocks.push({ type: 'horizontalRule' });
			at++;
		} else if (head) {
			blocks.push({
				type: 'heading',
				attrs: { level: Math.min(head[1].length, 3) },
				content: inlineNodes(head[2])
			});
			at++;
		} else if (quote.test(line)) {
			let end = at;
			while (end < lines.length && quote.test(lines[end])) end++;
			const inner = blocksOf(
				lines.slice(at, end).map((other) => quote.exec(other)![1]),
				context
			);
			blocks.push({ type: 'blockquote', content: inner.length ? inner : [{ type: 'paragraph' }] });
			at = end;
		} else if (itemOf(line)) {
			const [items, end] = listItems(lines, at);
			blocks.push(...lists(items, context));
			at = end;
		} else {
			blocks.push(...lineBlocks(line.trim(), context));
			at++;
		}
	}
	return blocks;
}

/** What stands in for a kind a schema lacks, before the paragraph that stands in for any: chat's tasks. */
const standIns: Record<string, string> = { taskList: 'bulletList', taskItem: 'listItem' };

/**
 * The node as a schema that has only the types `has` takes it: a bullet for a task, and a
 * paragraph with the node's text for any other type it lacks.
 */
function fit(node: DocNode, has: (type: string) => boolean): DocNode {
	if (has(node.type)) {
		return node.content ? { ...node, content: node.content.map((child) => fit(child, has)) } : node;
	}
	if (node.type in standIns) return fit({ type: standIns[node.type], content: node.content }, has);
	const words = docText(node);
	return { type: 'paragraph', ...(words && { content: [{ type: 'text', text: words }] }) };
}

/**
 * Code copied from a code editor, in the language it calls its mode: a code block when it spans
 * lines, else inline code. Its text is code whatever it looks like, so no Markdown is read.
 */
export function vscodePaste(text: string, mode: string): DocNode {
	return text.includes('\n')
		? codeBlock(text.replace(/\r\n?/g, '\n'), mode.toLowerCase())
		: { type: 'text', text, marks: [{ type: 'code' }] };
}

const isPlain = (node: DocNode) =>
	node.type === 'paragraph' && (node.content ?? []).every((child) => !child.marks);

/** What pasted Markdown holds: the web addresses of its images, each once, and its blocks. */
export type MarkdownPaste = {
	/** What to fetch into the note. */
	web: string[];
	/** The blocks the text stands for, with each address in `imported` as the image it was stored as. */
	blocks: (imported?: ImportedImages) => DocNode[];
};

/**
 * What a pasted text stands for when it holds any Markdown (a block, a mark, an image), else
 * null; every other line is a paragraph. `nodes` are the node types the editor has: what it
 * lacks is replaced as `fit` says. An image is inserted from one of our own attachment paths,
 * the only source sanitizeDoc stores, or from a web address `imported` has a path for: any
 * other web address becomes a link to it, named by the image's alt text. A link is made only
 * to an address sanitizeDoc keeps.
 */
export function parseMarkdownPaste(text: string, nodes: ReadonlySet<string>): MarkdownPaste | null {
	const lines = text
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.replace(/^[ \t]+/, (space) => space.replaceAll('\t', '    ')));
	const read = (imported: ImportedImages) => {
		const context = { imported, web: new Set<string>() };
		return { blocks: blocksOf(lines, context), web: [...context.web] };
	};
	const { blocks, web } = read(new Map());
	if (blocks.every(isPlain)) return null;
	return {
		web,
		blocks: (imported = new Map()) =>
			read(imported).blocks.map((block) => fit(block, (type) => nodes.has(type)))
	};
}

/**
 * `blocks` as a slice to paste. A paragraph at either end is open, so its text joins the line
 * around the cursor as the editor's own paste joins it; any other block is set in whole.
 */
export function pasteSlice(schema: Schema, blocks: DocNode[]): Slice {
	const isParagraph = (node: DocNode) => node.type === 'paragraph';
	return new Slice(
		Fragment.fromArray(blocks.map((block) => schema.nodeFromJSON(block))),
		isParagraph(blocks[0]) ? 1 : 0,
		isParagraph(blocks[blocks.length - 1]) ? 1 : 0
	);
}
