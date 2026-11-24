// The rich-text document the editor produces: ProseMirror JSON. The server never trusts
// what a browser sends, so every body goes through sanitizeDoc before it is stored, and
// pages render only the node types listed here.
import { editor as text } from '../strings/editor';

export type DocMark = { type: string; attrs?: Record<string, unknown> };
export type DocNode = {
	type: string;
	attrs?: Record<string, unknown>;
	content?: DocNode[];
	text?: string;
	marks?: DocMark[];
};

/** Where an uploaded attachment is served. Image nodes may only point here. */
export function attachmentPath(id: string): string {
	return `/files/attachments/${id}`;
}

/** The attachment id at the end of an attachmentPath. */
export function attachmentIdOf(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

const attachmentSrc = /^\/files\/attachments\/[0-9A-Z]{26}$/;
const safeHref = /^(https?:|mailto:)/i;
const codeLanguage = /^[a-z0-9+#-]{1,32}$/;

/** Whether an address may be a link's href: http(s) or mailto, and one a browser can open. */
export function isSafeHref(href: string): boolean {
	return safeHref.test(href) && URL.canParse(href);
}

/** Whether a source is an uploaded attachment's path, the only one an image may have. */
export function isAttachmentPath(src: string): boolean {
	return attachmentSrc.test(src);
}

/** What a resource mention may point at. */
export const resourceKinds = ['note', 'post', 'call'] as const;
export type ResourceKind = (typeof resourceKinds)[number];
export type ResourceRef = { kind: ResourceKind; id: string };
/**
 * The mentioned notes, posts and calls one reader may see, by resourceKey, with their titles
 * and pages. A mention whose target is missing is unavailable to that reader.
 */
export type ResourceTitles = Record<string, { title: string; url: string }>;

const resourceId = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Whether the runtime knows `value` as a time zone name. */
function isTimeZone(value: unknown): boolean {
	try {
		new Intl.DateTimeFormat('en', { timeZone: String(value) });
		return true;
	} catch {
		return false;
	}
}

export function isResourceKind(value: unknown): value is ResourceKind {
	return resourceKinds.includes(value as ResourceKind);
}

/** The key a resource mention's target has in ResourceTitles. */
export function resourceKey(ref: ResourceRef): string {
	return `${ref.kind}:${ref.id}`;
}

/** The notes, posts and calls a sanitized document mentions, each once. */
export function docResources(node: DocNode): ResourceRef[] {
	const found = new Map<string, ResourceRef>();
	const walk = (n: DocNode) => {
		if (n.type === 'resourceMention') {
			const ref = { kind: n.attrs?.kind as ResourceKind, id: String(n.attrs?.id) };
			found.set(resourceKey(ref), ref);
		}
		n.content?.forEach(walk);
	};
	walk(node);
	return [...found.values()];
}

/** A code block language sanitizeDoc keeps: short, lower case, e.g. "js" or "c++". */
export function isCodeLanguage(name: string): boolean {
	return codeLanguage.test(name);
}

// Node type → the attrs it may keep. Anything else in a body is rejected.
const nodeAttrs: Record<string, string[]> = {
	doc: [],
	paragraph: [],
	text: [],
	heading: ['level'],
	bulletList: [],
	orderedList: ['start'],
	listItem: [],
	taskList: [],
	taskItem: ['checked'],
	blockquote: [],
	codeBlock: ['language'],
	hardBreak: [],
	horizontalRule: [],
	// A collapsible section. Whether it is open is each reader's, so it has no attrs.
	details: [],
	detailsSummary: [],
	detailsContent: [],
	mention: ['id', 'label'],
	// A date and time, by its instant and the zone it was written in; readers see it on their own clock.
	relativeTime: ['timestamp', 'zone'],
	// A note, post or call, by kind and id only: each reader's page looks up the title, if they
	// may see it (resourceTitles), since titles change and readers differ.
	resourceMention: ['kind', 'id'],
	image: ['src', 'alt'],
	attachment: ['id', 'name', 'size', 'contentType']
};

const markAttrs: Record<string, string[]> = {
	bold: [],
	italic: [],
	strike: [],
	underline: [],
	code: [],
	kbd: [],
	link: ['href'],
	// The passage a comment on a note was made on, by the comment's id and nothing else.
	noteComment: ['commentId']
};

export class DocError extends Error {}

function pick(attrs: Record<string, unknown> | undefined, keys: string[]) {
	if (!attrs || keys.length === 0) return undefined;
	const kept = Object.fromEntries(keys.filter((k) => attrs[k] != null).map((k) => [k, attrs[k]]));
	return Object.keys(kept).length ? kept : undefined;
}

function sanitizeMark(mark: DocMark, path: string): DocMark {
	const keys = markAttrs[mark?.type];
	if (!keys) throw new DocError(`expected a known mark at ${path}, got "${mark?.type}"`);
	const attrs = pick(mark.attrs, keys);
	if (
		mark.type === 'noteComment' &&
		!(resourceId.test(String(attrs?.commentId)) && Object.keys(mark.attrs ?? {}).length === 1)
	) {
		throw new DocError(
			`expected only a comment id at ${path}, got ${JSON.stringify(mark.attrs ?? null)}`
		);
	}
	if (mark.type === 'link' && !safeHref.test(String(attrs?.href ?? ''))) {
		throw new DocError(`expected an http(s) or mailto link at ${path}, got "${attrs?.href}"`);
	}
	return attrs ? { type: mark.type, attrs } : { type: mark.type };
}

function sanitizeNode(node: DocNode, path: string): DocNode {
	const keys = nodeAttrs[node?.type];
	if (!keys) throw new DocError(`expected a known node at ${path}, got "${node?.type}"`);
	const out: DocNode = { type: node.type };
	const attrs = pick(node.attrs, keys);
	if (attrs) out.attrs = attrs;
	if (node.type === 'taskItem') out.attrs = { checked: attrs?.checked === true };
	if (node.type === 'image' && !attachmentSrc.test(String(attrs?.src ?? ''))) {
		throw new DocError(`expected an uploaded image at ${path}, got src "${attrs?.src}"`);
	}
	// Bodies saved before languages were checked may hold any name: lower-cased, or dropped.
	if (node.type === 'codeBlock' && attrs?.language != null) {
		const language = String(attrs.language).toLowerCase();
		if (isCodeLanguage(language)) out.attrs = { language };
		else delete out.attrs;
	}
	if (node.type === 'relativeTime' && !Number.isSafeInteger(attrs?.timestamp)) {
		throw new DocError(
			`expected a timestamp in whole milliseconds at ${path}, got ${attrs?.timestamp}`
		);
	}
	if (node.type === 'relativeTime' && attrs?.zone != null && !isTimeZone(attrs.zone)) {
		throw new DocError(`expected a time zone name at ${path}, got ${attrs.zone}`);
	}
	if (
		node.type === 'resourceMention' &&
		!(isResourceKind(attrs?.kind) && resourceId.test(String(attrs?.id)))
	) {
		throw new DocError(
			`expected a note, post or call and its id at ${path}, got ${attrs?.kind} "${attrs?.id}"`
		);
	}
	if (node.type === 'text') {
		if (typeof node.text !== 'string') throw new DocError(`expected text at ${path}`);
		out.text = node.text;
	}
	if (node.marks?.length)
		out.marks = node.marks.map((m, i) => sanitizeMark(m, `${path}.marks[${i}]`));
	if (node.content?.length) {
		out.content = node.content.map((c, i) => sanitizeNode(c, `${path}.content[${i}]`));
	}
	return out;
}

/** Parses a body sent by the editor and keeps only what pages know how to render. */
export function sanitizeDoc(json: string): DocNode {
	let parsed: DocNode;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new DocError('expected the body to be JSON from the editor');
	}
	if (parsed?.type !== 'doc')
		throw new DocError(`expected a doc at the root, got "${parsed?.type}"`);
	return sanitizeNode(parsed, 'doc');
}

const blockTypes = new Set([
	'paragraph',
	'heading',
	'listItem',
	'taskItem',
	'blockquote',
	'codeBlock',
	'detailsSummary'
]);

/** The words in a document, one block per line, for search and previews. */
export function docText(node: DocNode): string {
	if (node.type === 'text') return node.text ?? '';
	if (node.type === 'mention') return `@${node.attrs?.label ?? ''}`;
	if (node.type === 'hardBreak') return '\n';
	if (node.type === 'attachment') return String(node.attrs?.name ?? '');
	if (node.type === 'relativeTime') return text.relativeTime.text(Number(node.attrs?.timestamp));
	if (node.type === 'resourceMention') {
		return text.resourceMention.plain[node.attrs?.kind as ResourceKind];
	}
	const inner = (node.content ?? []).map(docText);
	return blockTypes.has(node.type) || node.type === 'doc'
		? inner.join(node.type === 'doc' || node.type === 'blockquote' ? '\n' : '').trim()
		: inner.join('\n');
}

/** The user ids mentioned in a document, each once. */
export function docMentions(node: DocNode): string[] {
	const ids = new Set<string>();
	const walk = (n: DocNode) => {
		if (n.type === 'mention' && typeof n.attrs?.id === 'string') ids.add(n.attrs.id);
		n.content?.forEach(walk);
	};
	walk(node);
	return [...ids];
}

/** The attachment ids a document points at, from images and file nodes. */
export function docAttachments(node: DocNode): string[] {
	return [...new Set(docFiles(node).map((file) => file.id))];
}

/** The document with each attachment id that `ids` names swapped for its copy's id. */
export function replaceAttachmentIds(node: DocNode, ids: Map<string, string>): DocNode {
	const attrs = node.attrs ?? {};
	const attachment = node.type === 'attachment' ? ids.get(String(attrs.id)) : undefined;
	if (attachment) return { ...node, attrs: { ...attrs, id: attachment } };
	const image = node.type === 'image' ? ids.get(attachmentIdOf(String(attrs.src))) : undefined;
	if (image) return { ...node, attrs: { ...attrs, src: attachmentPath(image) } };
	return node.content
		? { ...node, content: node.content.map((child) => replaceAttachmentIds(child, ids)) }
		: node;
}

/** The files a document holds, images and others, in reading order, with their names. */
export function docFiles(node: DocNode): { id: string; name: string }[] {
	if (node.type === 'attachment' && typeof node.attrs?.id === 'string') {
		return [{ id: node.attrs.id, name: String(node.attrs.name ?? '') }];
	}
	if (node.type === 'image') {
		return [{ id: attachmentIdOf(String(node.attrs?.src)), name: String(node.attrs?.alt ?? '') }];
	}
	return (node.content ?? []).flatMap(docFiles);
}

const notePath = /^\/notes\/([^/]+)\/?$/;

/** The note a link points at, by its path, on any origin; null for any other link. */
export function linkedNoteId(href: string): string | null {
	let path: string;
	try {
		// The base only resolves a relative link: an absolute one keeps its own origin.
		path = new URL(href, 'https://campfire.invalid').pathname;
	} catch {
		// A link that isn't a URL points at no note.
		return null;
	}
	return notePath.exec(path)?.[1] ?? null;
}

/**
 * The ids of the notes a document links to or mentions, each once. Whether they exist is the
 * caller's.
 */
export function docNoteRefs(node: DocNode): string[] {
	const ids = new Set<string>();
	const walk = (n: DocNode) => {
		for (const mark of n.marks ?? []) {
			const id = mark.type === 'link' ? linkedNoteId(String(mark.attrs?.href ?? '')) : null;
			if (id) ids.add(id);
		}
		if (n.type === 'resourceMention' && n.attrs?.kind === 'note') ids.add(String(n.attrs.id));
		n.content?.forEach(walk);
	};
	walk(node);
	return [...ids];
}

const withoutScheme = (address: string) => address.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** The address of a paragraph that is only a pasted web link, which gets a preview under it. */
export function bareLink(paragraph: DocNode): string | null {
	const [only, ...rest] = paragraph.content ?? [];
	const href = only?.marks?.find((mark) => mark.type === 'link')?.attrs?.href;
	if (rest.length > 0 || typeof href !== 'string' || !/^https?:\/\//.test(href)) return null;
	return withoutScheme(only.text?.trim() ?? '') === withoutScheme(href) ? href : null;
}

/** How many bare links in a document get a preview; later ones stay plain links. */
export const maxLinkPreviews = 3;

/** The document's task items in reading order, the order a tick's index counts in. */
export function taskItems(node: DocNode): DocNode[] {
	const items: DocNode[] = [];
	const walk = (n: DocNode) => {
		if (n.type === 'taskItem') items.push(n);
		n.content?.forEach(walk);
	};
	walk(node);
	return items;
}

/** A copy of the document with its index-th task item ticked or cleared. */
export function setTaskChecked(doc: DocNode, index: number, checked: boolean): DocNode {
	const copy = structuredClone(doc);
	const item = taskItems(copy)[index];
	if (!item) {
		throw new DocError(`expected a task item at index ${index}, the document has fewer`);
	}
	item.attrs = { checked };
	return copy;
}

/** A run of images shown together; see withGalleries. */
export type Gallery = { images: DocNode[] };

const isEmptyParagraph = (node: DocNode) => node.type === 'paragraph' && !node.content?.length;

/**
 * A document's blocks with every run of two or more images grouped into a gallery. The editor
 * puts an empty paragraph after each image it inserts, so empty paragraphs between images
 * don't break a run.
 */
export function withGalleries(blocks: DocNode[]): (DocNode | Gallery)[] {
	const out: (DocNode | Gallery)[] = [];
	let run: DocNode[] = [];
	let gap: DocNode[] = [];
	const flush = () => {
		out.push(...(run.length >= 2 ? [{ images: run }] : run), ...gap);
		run = [];
		gap = [];
	};
	for (const node of blocks) {
		if (node.type === 'image') {
			run.push(node);
			gap = [];
		} else if (run.length && isEmptyParagraph(node)) {
			gap.push(node);
		} else {
			flush();
			out.push(node);
		}
	}
	flush();
	return out;
}

/** The document's images in reading order, the order the lightbox steps through. */
export function docImages(node: DocNode): DocNode[] {
	if (node.type === 'image') return [node];
	return (node.content ?? []).flatMap(docImages);
}

export function isEmptyDoc(node: DocNode): boolean {
	return docText(node) === '' && docAttachments(node).length === 0;
}
