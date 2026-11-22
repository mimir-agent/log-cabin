// What only a note's editor has: highlighted code blocks, typographic punctuation, fetching
// pasted web images and the titles of the notes, posts and calls it mentions. Editor loads this
// module only for a note, so post, comment and chat editors don't download the grammars.
import { Extension, type AnyExtension } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Typography from '@tiptap/extension-typography';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
	absolutePositionToRelativePosition,
	relativePositionToAbsolutePosition,
	ySyncPluginKey
} from '@tiptap/y-tiptap';
import { mount, unmount } from 'svelte';
import {
	attachmentPath,
	bareLink,
	maxLinkPreviews,
	resourceKey,
	type DocNode,
	type ResourceKind,
	type ResourceRef,
	type ResourceTitles
} from '#lib/editor/doc.js';
import { codeBlockAttributes, ResourceMention } from '#lib/editor/extensions.js';
import { lowlight } from '#lib/editor/highlight.js';
import { editor as text } from '#lib/strings/editor.js';
import LinkPreview from './LinkPreview.svelte';
import { MarkdownPaste } from './markdown-paste.js';

type Resource = ResourceTitles[string];

/** Titles asked for once per page, for mentions the page's own `resources` didn't hold. */
const asked = new Map<string, Promise<Resource | null>>();

/** The target's title and page if this person may see it, asking the server once; null if not. */
function lookUp(ref: ResourceRef): Promise<Resource | null> {
	const key = resourceKey(ref);
	let found = asked.get(key);
	if (!found) {
		found = fetch(`/mentions/resources/${ref.kind}/${ref.id}`).then((response) =>
			response.ok ? (response.json() as Promise<Resource>) : null
		);
		asked.set(key, found);
	}
	return found;
}

/** A mention's chip: its title, linking to its page, or unavailable with neither. */
function showResource(dom: HTMLElement, kind: ResourceKind, target: Resource | null) {
	const chip = document.createElement(target ? 'a' : 'span');
	chip.className = 'resource-mention';
	chip.textContent = target?.title ?? text.resourceMention.unavailable[kind];
	if (target) chip.setAttribute('href', target.url);
	dom.replaceChildren(chip);
}

/**
 * A resource mention showing what this reader may see of it: from the page's `resources`, or,
 * for one written since the page loaded, by asking the server.
 */
const LiveResourceMention = (resources: () => ResourceTitles) =>
	ResourceMention.extend({
		addNodeView: () => (props) => {
			const ref = props.node.attrs as ResourceRef;
			const dom = document.createElement('span');
			const known = resources()[resourceKey(ref)];
			showResource(dom, ref.kind, known ?? null);
			if (!known) void lookUp(ref).then((target) => showResource(dom, ref.kind, target));
			return { dom };
		}
	});

/** What the import endpoint answers when the note won't take an address: a link stands in. */
const refusals = [400, 413, 415];

/**
 * A pasted web image fetched into the note: its attachment path, or null when the image stays
 * a link: the note refused the address, or couldn't be reached. Any other answer is reported
 * and leaves a link too.
 */
async function importImage(importUrl: string, url: string): Promise<string | null> {
	let response: Response;
	try {
		response = await fetch(importUrl, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ url })
		});
	} catch {
		// Offline or the like: the image stays a link, as for any refused address.
		return null;
	}
	if (response.status === 201)
		return attachmentPath(((await response.json()) as { id: string }).id);
	if (!refusals.includes(response.status)) {
		console.error(
			`${importUrl} answered ${response.status} to the image at ${url}; expected 201, or ${refusals.join(', ')} for an address it won't take`
		);
	}
	return null;
}

/**
 * The selection's ends held as Yjs relative positions, which keep to the same place while
 * others edit, and a way to read them back: a paste lands there once its images have been
 * fetched. If the text at either end was deleted meanwhile, it lands at the selection then.
 */
function holdSelection(state: EditorState): (now: EditorState) => { from: number; to: number } {
	const sync = ySyncPluginKey.getState(state);
	if (!sync) throw new Error('fetching pasted images into a note expects its live document');
	const { doc, type, mapping } = sync.binding;
	const held = [state.selection.from, state.selection.to].map((pos) =>
		absolutePositionToRelativePosition(pos, type, mapping)
	);
	return (now) => {
		const [from, to] = held.map((pos) =>
			relativePositionToAbsolutePosition(doc, type, pos, mapping)
		);
		return from === null || to === null ? now.selection : { from, to };
	};
}

/** The previews mounted in the editor, by the element each one fills. */
const cards = new WeakMap<Node, ReturnType<typeof mount>>();

/** A preview card for `href`, as RichText shows under a bare link; it never takes the caret. */
function previewCard(href: string): HTMLElement {
	const dom = document.createElement('div');
	dom.contentEditable = 'false';
	cards.set(dom, mount(LinkPreview, { target: dom, props: { href } }));
	return dom;
}

/** A card under each of the first three paragraphs that are only a link, as RichText draws them. */
function linkPreviewWidgets(doc: ProseMirrorNode): DecorationSet {
	const widgets: Decoration[] = [];
	doc.descendants((node, pos) => {
		if (widgets.length === maxLinkPreviews) return false;
		if (node.type.name !== 'paragraph') return true;
		const href = bareLink(node.toJSON() as DocNode);
		if (href) {
			widgets.push(
				// The key keeps the same card, and its fetched preview, while the note changes around it.
				Decoration.widget(pos + node.nodeSize, () => previewCard(href), {
					key: `link-preview:${href}`,
					side: 1,
					ignoreSelection: true,
					// A press on the card opens its link; the editor leaves it alone.
					stopEvent: () => true,
					destroy: (dom) => {
						const card = cards.get(dom);
						if (card) void unmount(card);
					}
				})
			);
		}
		return false;
	});
	return DecorationSet.create(doc, widgets);
}

const linkPreviewsKey = new PluginKey<DecorationSet>('linkPreviews');

/** Shows a link's preview under it while the note is written, as everywhere the body is read. */
const LinkPreviews = Extension.create({
	name: 'linkPreviews',
	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: linkPreviewsKey,
				state: {
					init: (_, state) => linkPreviewWidgets(state.doc),
					apply: (tr, widgets) => (tr.docChanged ? linkPreviewWidgets(tr.doc) : widgets)
				},
				props: { decorations: (state) => linkPreviewsKey.getState(state) }
			})
		];
	}
});

/**
 * The note editor's extensions; each one named like a document extension replaces it.
 * `resources` is the page's titles for the notes, posts and calls the note mentions;
 * `uploadUrl`, for someone who may edit the note, is where its files go.
 */
export function noteExtensions(
	resources: () => ResourceTitles,
	uploadUrl: string | undefined
): AnyExtension[] {
	return [
		CodeBlockLowlight.extend({ addAttributes: codeBlockAttributes }).configure({ lowlight }),
		// Curly quotes, dashes and the like as they're typed; never inside code or a key.
		Typography,
		MarkdownPaste(
			uploadUrl
				? {
						hold: holdSelection,
						fetch: async (urls) => {
							const paths = await Promise.all(
								urls.map((url) => importImage(`${uploadUrl}/from-url`, url))
							);
							return new Map(
								urls.flatMap((url, i) => (paths[i] ? [[url, paths[i]] as const] : []))
							);
						}
					}
				: undefined
		),
		LinkPreviews,
		LiveResourceMention(resources)
	];
}
