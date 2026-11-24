import { mount } from 'svelte';
import { Extension, InputRule, type AnyExtension } from '@tiptap/core';
import { PluginKey, TextSelection } from '@tiptap/pm/state';
import type { MentionNodeAttrs } from '@tiptap/extension-mention';
import { Placeholder } from '@tiptap/extensions';
import { Suggestion, exitSuggestion } from '@tiptap/suggestion';
import {
	documentExtensions,
	linkHref,
	type Member,
	type MentionItem,
	type MentionSuggestion,
	type ResourceItem
} from '#lib/editor/extensions.js';
import { applySlash, filterSlash, triggerMatch, type SlashItem } from '#lib/editor/slash.js';
import { emojiMatch, emojiNamed, filterEmoji, loadEmoji } from '#lib/editor/emoji.js';
import type { PickerEmoji } from '#lib/emoji/data.js';
import type { OrgEmoji } from '#lib/emoji/picker.js';
import EmojiMenu from './EmojiMenu.svelte';
import MentionList from './MentionList.svelte';
import SlashMenu from './SlashMenu.svelte';
import { MarkdownPaste } from './markdown-paste.js';
import { suggestionRender } from './suggestion-render.js';
import { EditableRelativeTime } from './time-chip.js';

export type { Member, MentionItem, ResourceItem };
const slashKey = new PluginKey('slash');
const emojiKey = new PluginKey('emoji');

/** The notes, posts and calls matching what was typed after @ that this person may see. */
export async function findResources(query: string): Promise<ResourceItem[]> {
	const response = await fetch(`/mentions/resources?q=${encodeURIComponent(query)}`);
	if (!response.ok) {
		throw new Error(`expected notes, posts and calls matching "${query}", got ${response.status}`);
	}
	return ((await response.json()) as { items: ResourceItem[] }).items;
}

/**
 * `@` suggestions over `members()`, then, once something is typed and `resources` is given (a
 * note's editor), the notes, posts and calls it finds; shown in a MentionList appended to the
 * body. A person becomes a mention, anything else a resource mention.
 */
export function mentionSuggestion(
	members: () => Member[],
	resources?: (query: string) => Promise<ResourceItem[]>
): MentionSuggestion {
	return {
		char: '@',
		items: async ({ query }) => {
			const people = members()
				.filter((member) => member.name.toLowerCase().includes(query.toLowerCase()))
				.slice(0, 8);
			return resources && query ? [...people, ...(await resources(query))] : people;
		},
		render: suggestionRender<MentionItem, MentionNodeAttrs>({
			mount: (target, _props, onselect) => mount(MentionList, { target, props: { onselect } }),
			pick: (props, item) => {
				if (!('kind' in item)) {
					props.command({ id: item.id, label: item.name });
					return;
				}
				props.editor
					.chain()
					.focus()
					.insertContentAt(props.range, [
						{ type: 'resourceMention', attrs: { kind: item.kind, id: item.id } },
						{ type: 'text', text: ' ' }
					])
					.run();
			}
		})
	};
}

/**
 * The `/` menu: block types to turn the current block into, in a SlashMenu mounted where
 * mentionSuggestion's list goes. Add it after chatKeys, like the mention list, so its Enter and
 * Tab come first.
 */
export function slashMenu(items: () => SlashItem[]): AnyExtension {
	return Extension.create({
		name: 'slashMenu',
		addProseMirrorPlugins() {
			return [
				Suggestion<SlashItem, SlashItem>({
					editor: this.editor,
					pluginKey: slashKey,
					char: '/',
					findSuggestionMatch: triggerMatch,
					items: ({ query }) => filterSlash(query, items()),
					command: ({ editor, range, props }) => applySlash(editor, range, props),
					render: suggestionRender<SlashItem, SlashItem>({
						mount: (target, props, onselect) =>
							mount(SlashMenu, {
								target,
								props: {
									onselect,
									onclose: () => exitSuggestion(props.editor.view, slashKey)
								}
							}),
						pick: (props, item) => props.command(item)
					})
				})
			];
		}
	});
}

/**
 * The `:` list: two characters after it, the standard emoji and the org's own whose name or
 * keywords match, in an EmojiMenu mounted where the others go. Picking one puts its character,
 * or `:name:` for an org emoji, in place of what was typed; typing a standard emoji's whole
 * `:name:` does that straight away. Add it after chatKeys, like the others, so its Enter and Tab
 * come first.
 */
export function emojiMenu(org: () => OrgEmoji): AnyExtension {
	return Extension.create({
		name: 'emojiMenu',
		addInputRules: () => [
			new InputRule({
				find: /(?:^|\s):([^\s:]+):$/,
				handler: ({ state, range, match }) => {
					const emoji = emojiNamed(match[1]);
					// An org emoji of that name is drawn from the text as typed, over a standard one.
					if (!emoji || match[1] in org().custom) return null;
					// The range ends after the closing colon, which is already in the document.
					state.tr.insertText(emoji, range.to - match[1].length - 2, range.to);
				}
			})
		],
		addProseMirrorPlugins() {
			return [
				Suggestion<PickerEmoji, PickerEmoji>({
					editor: this.editor,
					pluginKey: emojiKey,
					char: ':',
					findSuggestionMatch: emojiMatch,
					items: async ({ query }) => filterEmoji(query, await loadEmoji(), org()),
					command: ({ editor, range, props }) =>
						editor.chain().focus().insertContentAt(range, props.value).run(),
					render: suggestionRender<PickerEmoji, PickerEmoji>({
						mount: (target, props, onselect) =>
							mount(EmojiMenu, {
								target,
								props: {
									onselect,
									onclose: () => exitSuggestion(props.editor.view, emojiKey)
								}
							}),
						pick: (props, item) => props.command(item)
					})
				})
			];
		}
	});
}

/**
 * Chat's keys, after Campsite's EnterSubmit: Enter sends (Shift+Enter stays a line break),
 * except on a touch screen, where Enter is a new line and the button sends. ArrowUp in an empty
 * box edits your last message. It goes first in the list, so the mention list, the lists and
 * code blocks, which come later and so run earlier, still take the keys they use.
 */
export function chatKeys(on: {
	enter: () => (() => void) | undefined;
	emptyArrowUp: () => (() => void) | undefined;
}): AnyExtension {
	return Extension.create({
		name: 'chatKeys',
		addKeyboardShortcuts: () => ({
			Enter: () => {
				const send = on.enter();
				if (!send || matchMedia('(pointer: coarse)').matches) return false;
				send();
				return true;
			},
			ArrowUp: ({ editor }) => {
				const edit = on.emptyArrowUp();
				if (!edit || !editor.isEmpty) return false;
				edit();
				return true;
			}
		})
	});
}

/**
 * Ctrl/⌘+K opens the editor's link field, in every editor, with or without formatting buttons.
 * It handles the key, so the page's Quick switcher (which skips handled keys) stays shut.
 */
export function linkKey(open: () => void): AnyExtension {
	return Extension.create({
		name: 'linkKey',
		addKeyboardShortcuts: () => ({
			'Mod-k': () => {
				open();
				return true;
			}
		})
	});
}

/**
 * Typing the `)` that closes `[text](address)` turns it into linked text, if the link field
 * would take the address; otherwise it stays as typed.
 */
const markdownLink = Extension.create({
	name: 'markdownLink',
	addInputRules: () => [
		new InputRule({
			find: /\[([^[\]]+)\]\(([^()\s]+)\)$/,
			handler: ({ state, range, match }) => {
				const href = linkHref(match[2]);
				if (!href) return null;
				const { tr, schema } = state;
				tr.replaceWith(
					range.from,
					range.to,
					schema.text(match[1], [schema.marks.link.create({ href })])
				);
				// The link would otherwise carry on with whatever is typed next.
				tr.removeStoredMark(schema.marks.link);
			}
		})
	]
});

/**
 * Typing `[ ] ` or `[x] ` right after the `- ` that began a bullet list turns that list's one
 * item into a task item, so "- [ ] a" typed as Markdown gives a checklist. (Typed at the start
 * of any other block, TaskItem's own rule does it.)
 */
const bulletToTask = Extension.create({
	name: 'bulletToTask',
	addInputRules: () => [
		new InputRule({
			find: /^\[([ xX])\]\s$/,
			handler: ({ state, range, match }) => {
				const { tr, schema } = state;
				const $start = tr.doc.resolve(range.from);
				const list = $start.depth >= 3 ? $start.node(-2) : null;
				if (list?.type.name !== 'bulletList' || list.childCount !== 1 || $start.index(-1) !== 0) {
					return null;
				}
				const at = $start.before(-2);
				tr.delete(range.from, range.to);
				const emptied = tr.doc.nodeAt(at)!;
				tr.replaceWith(
					at,
					at + emptied.nodeSize,
					schema.nodes.taskList.create(null, [
						schema.nodes.taskItem.create({ checked: match[1] !== ' ' }, emptied.firstChild!.content)
					])
				);
				tr.setSelection(TextSelection.create(tr.doc, range.from));
			}
		})
	]
});

/**
 * The extensions behind every editor: the document's, a placeholder, and live editing when on.
 * Without `checklists` the task nodes are left out, so typing "[ ] " can't make a checklist
 * where nobody could tick it (chat). An extension in `extra` named like one of the document's
 * takes its place, so it must build the same node.
 */
export function editorExtensions(opts: {
	/** Read on every redraw, so a box can change what it asks for (a comment, then a reply). */
	placeholder: () => string;
	mentionSuggestion: MentionSuggestion;
	checklists: boolean;
	/** A note's live-editing extensions, from live-extensions.ts. */
	live?: AnyExtension[];
	extra?: AnyExtension[];
}): AnyExtension[] {
	const taskNodes = ['taskList', 'taskItem'];
	const extra = opts.extra ?? [];
	const replaced = new Set(extra.map((extension) => extension.name));
	return [
		...documentExtensions({
			mentionSuggestion: opts.mentionSuggestion,
			undoRedo: !opts.live
		})
			.map((extension) => (extension.name === 'relativeTime' ? EditableRelativeTime : extension))
			.filter(
				(extension) =>
					(opts.checklists || !taskNodes.includes(extension.name)) && !replaced.has(extension.name)
			),
		...extra,
		...(replaced.has('markdownPaste') ? [] : [MarkdownPaste()]),
		markdownLink,
		...(opts.checklists ? [bulletToTask] : []),
		Placeholder.configure({ placeholder: opts.placeholder }),
		...(opts.live ?? [])
	];
}
