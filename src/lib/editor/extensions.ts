// The document's node and mark types, shared by the browser editor and the server, which
// builds the same ProseMirror schema from them. Nothing here may touch the DOM or Svelte.
import { Mark, Node, getSchema, mergeAttributes, type AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import CodeBlock from '@tiptap/extension-code-block';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Mention, { type MentionNodeAttrs } from '@tiptap/extension-mention';
import type { SuggestionOptions } from '@tiptap/suggestion';
import { editor as text } from '../strings/editor';
import { isCodeLanguage, type ResourceKind, type ResourceRef } from './doc';

export type Member = { id: string; name: string };
/** A note, post or call the @ list offers, with the title its writer may see. */
export type ResourceItem = ResourceRef & { title: string };
/** What the @ list offers: people, and in a note also notes, posts and calls. */
export type MentionItem = Member | ResourceItem;
export type MentionSuggestion = Omit<SuggestionOptions<MentionItem, MentionNodeAttrs>, 'editor'>;

const safeHref = /^(https?:|mailto:)/i;

/**
 * The address a typed link stands for: "example.com" is https, and only http, https and mailto
 * links are kept. Null where the link field must refuse it.
 */
export function linkHref(typed: string): string | null {
	const href = /^[a-z][a-z\d+.-]*:/i.test(typed) ? typed : `https://${typed}`;
	return safeHref.test(href) && URL.canParse(href) ? href : null;
}

// Stored as data-* attributes so copy and paste inside the editor keeps them.
const dataAttribute = (key: string, parse: (value: string) => unknown = String) => ({
	default: null,
	parseHTML: (element: HTMLElement) => parse(element.getAttribute(`data-${key}`) ?? ''),
	renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${key}`]: attrs[key] })
});

/**
 * A code block's attributes: its language, read from pasted HTML's `language-*` class only when
 * sanitizeDoc would keep it.
 */
export const codeBlockAttributes = () => ({
	language: {
		default: null,
		parseHTML: (element: HTMLElement) => {
			const name = [...(element.firstElementChild?.classList ?? [])]
				.find((className) => className.startsWith('language-'))
				?.slice('language-'.length)
				.toLowerCase();
			return name && isCodeLanguage(name) ? name : null;
		},
		rendered: false
	}
});

/**
 * A key on a keyboard, written inline, e.g. ⌘ K. Nothing else marks the same text, and like
 * code its text is typed as is: no typographic quotes or dashes. Like code it carries on while
 * you type (pressing its button with nothing selected marks all that follows) and ArrowRight at
 * its end steps out.
 */
export const Kbd = Mark.create({
	name: 'kbd',
	excludes: '_',
	code: true,
	exitable: true,
	parseHTML: () => [{ tag: 'kbd' }],
	renderHTML: ({ HTMLAttributes }) => ['kbd', HTMLAttributes, 0]
});

/**
 * The passage a comment on a note was made on, by the comment's id. Only the note's hub adds
 * one (comment-marks.ts), so nothing parses it from pasted HTML; typing at its edges doesn't
 * extend it, and comments may overlap (y-prosemirror keys each one by its attributes).
 */
export const NoteComment = Mark.create({
	name: 'noteComment',
	inclusive: false,
	excludes: '',
	addAttributes: () => ({
		commentId: {
			default: null,
			renderHTML: (attrs: Record<string, unknown>) => ({ 'data-comment-id': attrs.commentId })
		}
	}),
	parseHTML: () => [],
	renderHTML: ({ HTMLAttributes }) => [
		'span',
		mergeAttributes(HTMLAttributes, { class: 'note-comment' }),
		0
	]
});

/** An uploaded file that isn't an image, shown as a block with its name. */
export const Attachment = Node.create({
	name: 'attachment',
	group: 'block',
	atom: true,
	draggable: true,
	addAttributes: () => ({
		id: dataAttribute('id'),
		name: dataAttribute('name'),
		size: dataAttribute('size', Number),
		contentType: dataAttribute('content-type')
	}),
	parseHTML: () => [{ tag: 'div[data-attachment]' }],
	renderHTML: ({ node, HTMLAttributes }) => [
		'div',
		mergeAttributes(HTMLAttributes, { 'data-attachment': '' }),
		`${node.attrs.name} (${text.fileSize(node.attrs.size)})`
	]
});

/** The top of the next hour on this device's clock: where a new time starts. */
export function nextHour(): Date {
	const at = new Date();
	at.setHours(at.getHours() + 1, 0, 0, 0);
	return at;
}

/** A time to insert: the instant, with this device's zone as the one it was written in. */
export const timeNode = (timestamp: number) => ({
	type: 'relativeTime',
	attrs: { timestamp, zone: Intl.DateTimeFormat().resolvedOptions().timeZone }
});

/**
 * A date and time, shown on each reader's own clock, with the time in the zone it was written
 * in as its title. Only its instant and that zone are stored; each render works out the rest.
 * A time saved before zones were kept has none, and its title shows the reader's zone.
 */
export const RelativeTime = Node.create({
	name: 'relativeTime',
	group: 'inline',
	inline: true,
	atom: true,
	addAttributes: () => ({
		timestamp: dataAttribute('timestamp', Number),
		zone: dataAttribute('zone')
	}),
	parseHTML: () => [{ tag: 'time[data-timestamp]' }],
	renderHTML: ({ node, HTMLAttributes }) => {
		const at: number = node.attrs.timestamp;
		const reader = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return [
			'time',
			mergeAttributes(HTMLAttributes, {
				class: 'relative-time',
				datetime: new Date(at).toISOString(),
				title: text.relativeTime.title(at, node.attrs.zone ?? reader)
			}),
			text.relativeTime.chip(at, reader)
		];
	},
	renderText: ({ node }) => text.relativeTime.text(node.attrs.timestamp)
});

/**
 * A note, post or call, by kind and id. The document never holds its title: what each reader
 * sees comes from their page (RichText's `resources`) or, in a note's editor, its node view.
 * Without one it shows as unavailable.
 */
export const ResourceMention = Node.create({
	name: 'resourceMention',
	group: 'inline',
	inline: true,
	atom: true,
	addAttributes: () => ({ kind: dataAttribute('kind'), id: dataAttribute('id') }),
	parseHTML: () => [{ tag: 'span[data-resource-mention]' }],
	renderHTML: ({ node, HTMLAttributes }) => [
		'span',
		mergeAttributes(HTMLAttributes, { 'data-resource-mention': '', class: 'resource-mention' }),
		text.resourceMention.unavailable[node.attrs.kind as ResourceKind]
	],
	renderText: ({ node }) => text.resourceMention.plain[node.attrs.kind as ResourceKind]
});

/**
 * The nodes and marks of every document; they only produce what sanitizeDoc keeps.
 * The browser adds mention suggestions, and turns undo history off when a shared
 * document keeps its own.
 */
export function documentExtensions(opts: {
	mentionSuggestion?: MentionSuggestion;
	undoRedo: boolean;
}): AnyExtension[] {
	return [
		StarterKit.configure({
			heading: { levels: [1, 2, 3] },
			link: {
				openOnClick: false,
				autolink: true,
				defaultProtocol: 'https',
				isAllowedUri: (url) => safeHref.test(url)
			},
			undoRedo: opts.undoRedo ? undefined : false,
			// Its own extension below, so an editor can put a highlighting one in its place.
			codeBlock: false
		}),
		CodeBlock.extend({ addAttributes: codeBlockAttributes }),
		// Only uploaded images: a pasted <img> pointing elsewhere would fail sanitizeDoc.
		Image.extend({
			parseHTML: () => [{ tag: 'img[src^="/files/attachments/"]' }]
		}).configure({ inline: false, allowBase64: false }),
		Attachment,
		Kbd,
		NoteComment,
		RelativeTime,
		ResourceMention,
		// Open or closed is each reader's own, never stored: `persist: false` keeps it out of
		// the document. The button is drawn only by the browser editor's node view.
		Details.configure({
			persist: false,
			renderToggleButton: ({ element, isOpen }) => {
				element.textContent = text.details.glyph;
				element.setAttribute('aria-label', text.details.toggle(isOpen));
				element.setAttribute('aria-expanded', String(isOpen));
			}
		}),
		DetailsSummary,
		DetailsContent,
		TaskList,
		TaskItem.configure({ nested: true }),
		Mention.configure({
			renderText: ({ node }) => `@${node.attrs.label}`,
			renderHTML: ({ node, options }) => [
				'span',
				mergeAttributes({ class: 'mention' }, options.HTMLAttributes),
				`@${node.attrs.label}`
			],
			...(opts.mentionSuggestion && { suggestion: opts.mentionSuggestion })
		})
	];
}

/** The ProseMirror schema documents are written in, for code that has no editor. */
export function documentSchema() {
	return getSchema(documentExtensions({ undoRedo: false }));
}
