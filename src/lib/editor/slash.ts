// The menu `/` opens: what it offers, which typed text opens it, and what picking an item does.
// Nothing here draws; the list is SuggestionList.svelte, driven by slashMenu() in components/editor.
import { findParentNode, type ChainedCommands, type Editor, type Range } from '@tiptap/core';
import { findSuggestionMatch } from '@tiptap/suggestion';
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

export type SlashItem = {
	label: string;
	hint: string;
	/** Other words that find the item; never shown. */
	aliases: string[];
} & (
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
	text: { run: (chain) => chain.setParagraph() },
	heading1: { run: (chain) => chain.setHeading({ level: 1 }) },
	heading2: { run: (chain) => chain.setHeading({ level: 2 }) },
	heading3: { run: (chain) => chain.setHeading({ level: 3 }) },
	bulletList: { isIn: inList('bulletList'), run: (chain) => chain.toggleBulletList() },
	orderedList: { isIn: inList('orderedList'), run: (chain) => chain.toggleOrderedList() },
	taskList: { isIn: inList('taskList'), run: (chain) => chain.toggleTaskList() },
	quote: { run: (chain) => chain.setBlockquote() },
	codeBlock: { run: (chain) => chain.setCodeBlock() },
	divider: { run: (chain) => chain.setHorizontalRule() },
	details: { run: (chain) => chain.setDetails() },
	time: {
		inline: true,
		run: (chain) =>
			chain.insertContent([timeNode(nextHour().getTime()), { type: 'text', text: ' ' }])
	}
} satisfies Record<string, Block>;

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
		...(file ? [{ ...slash.file, act: file }] : []),
		{ ...slash.mention, act: (editor: Editor) => editor.chain().focus().insertContent('@').run() },
		...(room && surface !== 'comment' ? [{ ...slash.callLink, act: callLink }] : []),
		...(emoji ? [{ ...slash.emoji, act: emoji }] : [])
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
