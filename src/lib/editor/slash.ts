// The menu `/` opens: what it offers, which typed text opens it, and what picking an item does.
// Nothing here draws; the list is SuggestionList.svelte, driven by slashMenu() in components/editor.
import { findParentNode, type ChainedCommands, type Editor, type Range } from '@tiptap/core';
import { findSuggestionMatch } from '@tiptap/suggestion';
import { editor as text } from '../strings/editor';

export type SlashItem = {
	label: string;
	hint: string;
	/** Other words that find the item; never shown. */
	aliases: string[];
	/** Whether the caret is already in this item's block, so picking it only removes the typed text. */
	isIn?: (editor: Editor) => boolean;
	/** Turns the block the caret is in into this item's. */
	run: (chain: ChainedCommands) => ChainedCommands;
};

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
	details: { run: (chain) => chain.setDetails() }
} satisfies Record<string, Pick<SlashItem, 'isIn' | 'run'>>;

/** In the order the menu lists them. */
export const slashItems: SlashItem[] = (Object.keys(blocks) as (keyof typeof blocks)[]).map(
	(id) => ({ ...text.slash[id], ...blocks[id] })
);

/** The items whose label or an alias contains what was typed after `/`, in menu order. */
export function filterSlash(query: string): SlashItem[] {
	const typed = query.toLowerCase();
	return slashItems.filter(
		(item) =>
			item.label.toLowerCase().includes(typed) ||
			item.aliases.some((alias) => alias.includes(typed))
	);
}

/**
 * Where `/` opens the menu: at the start of a block or after a space, and never in code. The
 * query ends at the first space, so typing one closes the menu. Tiptap's own match finds a
 * prefix in the text node before the caret, which a mark splits (bold text then `/` leaves a
 * node that is just the `/`), so the character before the `/` is read from the block. A line
 * break reads as nothing, like the start of a block.
 */
export const slashMatch: typeof findSuggestionMatch = (trigger) => {
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
	if (item.isIn?.(editor)) {
		chain.run();
		return;
	}
	if ($from.parent.content.size > typed) {
		const below = $from.after() - typed;
		chain.insertContentAt(below, { type: 'paragraph' }).setTextSelection(below + 1);
	}
	item.run(chain).run();
}
