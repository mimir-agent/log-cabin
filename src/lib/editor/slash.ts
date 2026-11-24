// The menu `/` opens: what it offers, which typed text opens it, and what picking an item does.
// Nothing here draws; the list is SuggestionList.svelte, driven by slashMenu() in components/editor.
import { findParentNode, type ChainedCommands, type Editor, type Range } from '@tiptap/core';
import { findSuggestionMatch } from '@tiptap/suggestion';
import type { IconName } from '../components/ui/icons/campsite-icons';
import { editor as text } from '../strings/editor';
import { nextHour, timeNode } from './extensions';

/** A block type: what picking it turns the block the caret is in into. */
type Block = {
	/** Whether the caret is already in this item's block, so picking it only removes the typed text. */
	isIn?: (editor: Editor) => boolean;
	/** Whether picking it puts something at the caret, not a block of its own. */
	inline?: boolean;
	/** Turns the block the caret is in into this item's. */
	run: (chain: ChainedCommands) => ChainedCommands;
};

/** How an item is drawn beside its label. */
type Look = {
	icon: IconName;
	/** What typing at the start of a line does the same, if anything: shown as a key. */
	shortcut?: string;
};

export type SlashItem = {
	label: string;
	hint: string;
	/** Other words that find the item; never shown. */
	aliases: string[];
} & Look &
	(
		| Block
		/** An action that isn't a block (a file chooser, an `@`): runs once the typed text is gone. */
		| { act: (editor: Editor) => void }
	);

const listKinds = ['bulletList', 'orderedList', 'taskList'];

/** Whether the closest list around the caret is a `kind`: toggling one of its own kind lifts the item out. */
const inList = (kind: string) => (editor: Editor) =>
	findParentNode((node) => listKinds.includes(node.type.name))(editor.state.selection)?.node.type
		.name === kind;

const blocks = {
	text: { icon: 'text-align-left', run: (chain) => chain.setParagraph() },
	heading1: { icon: 'heading1', shortcut: '#', run: (chain) => chain.setHeading({ level: 1 }) },
	heading2: { icon: 'heading2', shortcut: '##', run: (chain) => chain.setHeading({ level: 2 }) },
	heading3: { icon: 'heading3', shortcut: '###', run: (chain) => chain.setHeading({ level: 3 }) },
	bulletList: {
		icon: 'unordered-list',
		shortcut: '-',
		isIn: inList('bulletList'),
		run: (chain) => chain.toggleBulletList()
	},
	orderedList: {
		icon: 'ordered-list',
		shortcut: '1.',
		isIn: inList('orderedList'),
		run: (chain) => chain.toggleOrderedList()
	},
	taskList: {
		icon: 'checklist',
		shortcut: '[ ]',
		isIn: inList('taskList'),
		run: (chain) => chain.toggleTaskList()
	},
	quote: { icon: 'quote', shortcut: '>', run: (chain) => chain.setBlockquote() },
	codeBlock: { icon: 'code-block', shortcut: '```', run: (chain) => chain.setCodeBlock() },
	divider: { icon: 'horizontal-rule', shortcut: '---', run: (chain) => chain.setHorizontalRule() },
	details: { icon: 'chevron-right', run: (chain) => chain.setDetails() },
	time: {
		icon: 'clock',
		inline: true,
		run: (chain) =>
			chain.insertContent([timeNode(nextHour().getTime()), { type: 'text', text: ' ' }])
	}
} satisfies Record<string, Block & Look>;

/** What each kind of box lists: the full document menu, the comment box's, and chat's. */
export type SlashSurface = 'document' | 'comment' | 'chat';

/** The block items a surface lists, in order. */
const surfaceBlocks: Record<SlashSurface, (keyof typeof blocks)[]> = {
	document: Object.keys(blocks) as (keyof typeof blocks)[],
	comment: (Object.keys(blocks) as (keyof typeof blocks)[]).filter((id) => id !== 'time'),
	chat: ['bulletList', 'orderedList', 'quote', 'codeBlock']
};

/** What only the box that mounts the menu can do. */
export type SlashActions = {
	/** Opens the file chooser; absent where the box takes no attachments. */
	file?: () => void;
	/** Opens the emoji picker. */
	emoji?: () => void;
	/** The link to the writer's personal call room; absent for a guest, who has none. */
	room?: string;
};

/**
 * The items a surface lists, in order: its blocks, then Image or file, Mention someone, Call
 * link and Emoji where the box and the writer can do them. The comment box has no Call link.
 */
export function slashItems(
	surface: SlashSurface,
	{ file, emoji, room }: SlashActions
): SlashItem[] {
	const { slash } = text;
	const callLink = (editor: Editor) =>
		editor
			.chain()
			.focus()
			.insertContent([
				{
					type: 'text',
					text: slash.callLink.label,
					marks: [{ type: 'link', attrs: { href: room } }]
				},
				{ type: 'text', text: ' ' }
			])
			.run();
	return [
		...surfaceBlocks[surface].map((id) => ({ ...slash[id], ...blocks[id] })),
		...(file ? [{ ...slash.file, icon: 'picture-plus' as const, act: file }] : []),
		{
			...slash.mention,
			icon: 'at-sign' as const,
			act: (editor: Editor) => editor.chain().focus().insertContent('@').run()
		},
		...(room && surface !== 'comment'
			? [{ ...slash.callLink, icon: 'video-camera' as const, act: callLink }]
			: []),
		...(emoji ? [{ ...slash.emoji, icon: 'face-smile-plus' as const, act: emoji }] : [])
	];
}

/** The items whose label or an alias contains what was typed after `/`, in order. */
export function filterSlash(query: string, items: SlashItem[]): SlashItem[] {
	const typed = query.toLowerCase();
	return items.filter(
		(item) =>
			item.label.toLowerCase().includes(typed) ||
			item.aliases.some((alias) => alias.includes(typed))
	);
}

/**
 * Where a trigger character (`/`, `:`) opens its list: at the start of a block or after a space,
 * and never in code. The query ends at the first space, so typing one closes the list. Tiptap's
 * own match finds a prefix in the text node before the caret, which a mark splits (bold text then
 * `/` leaves a node that is just the `/`), so the character before the trigger is read from the
 * block. A line break reads as nothing, like the start of a block.
 */
export const triggerMatch: typeof findSuggestionMatch = (trigger) => {
	const { $position } = trigger;
	const inCode =
		$position.parent.type.spec.code || $position.marks().some((mark) => mark.type.spec.code);
	if (inCode) return null;
	const match = findSuggestionMatch(trigger);
	if (!match) return null;
	const before = $position.doc.textBetween(
		Math.max(match.range.from - 1, $position.start()),
		match.range.from,
		'\0',
		(leaf) => (leaf.type.name === 'hardBreak' ? '' : '\0')
	);
	return before === '' || before === ' ' ? match : null;
};

/**
 * Deletes the typed `/query`, then makes the item's block of the current block, or of a new
 * empty block below it when the block holds other text. Where the caret is already in the
 * item's block, only the typed text goes.
 */
export function applySlash(editor: Editor, range: Range, item: SlashItem) {
	const typed = range.to - range.from;
	const $from = editor.state.doc.resolve(range.from);
	const chain = editor.chain().focus().deleteRange(range);
	if ('act' in item) {
		chain.run();
		item.act(editor);
		return;
	}
	if (item.isIn?.(editor)) {
		chain.run();
		return;
	}
	if (!item.inline && $from.parent.content.size > typed) {
		const below = $from.after() - typed;
		chain.insertContentAt(below, { type: 'paragraph' }).setTextSelection(below + 1);
	}
	item.run(chain).run();
}
