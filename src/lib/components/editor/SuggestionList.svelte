<!--
@component
The list under an editor's caret that a trigger character opens (@, /): placed in what the person
can see, moved with ArrowUp and ArrowDown, picked with Enter, Tab or the pointer. The editor
keeps the focus and drives it through `show` and `keydown`, which `suggestionRender` calls. The
caller draws each row.
-->
<script lang="ts" generics="Item">
	import type { Snippet } from 'svelte';
	import {
		placePopup,
		visibleArea,
		watchVisibleArea,
		type Point
	} from '#lib/editor/suggestion-popup.js';

	const {
		label,
		empty,
		key,
		labelled = false,
		onselect,
		row,
		actions
	}: {
		/** Names the listbox. */
		label: string;
		/** Said in place of the list when nothing matches. */
		empty: string;
		/** Tells items apart, so a row keeps its place as the list narrows. */
		key: (item: Item) => string;
		/**
		 * Whether a row puts its name in `<option id>-label` and its hint in `<option id>-hint`, so
		 * the option is named by the name alone and described by the hint. Otherwise the whole row
		 * names it.
		 */
		labelled?: boolean;
		onselect: (item: Item) => void;
		/** The inside of an item's row, given the option's id. */
		row: Snippet<[Item, string]>;
		/** Under the empty message: buttons that act on it. */
		actions?: Snippet;
	} = $props();

	const id = $props.id();
	let items = $state<Item[]>([]);
	let rect = $state<DOMRect | null>(null);
	let selected = $state(0);
	let box = $state<HTMLElement>();
	/** The editor's own element: it keeps the focus, so it names the option that is active. */
	let input = $state<HTMLElement>();
	let placed = $state<Point>();

	/** The gap between the caret and the list: `--gap-xs`. */
	const gap = 4;

	function place() {
		if (!rect || !box) return;
		const size = { width: box.offsetWidth, height: box.offsetHeight };
		placed = placePopup(rect, size, visibleArea(), gap);
	}

	// Measured after the DOM has the new items, since their count sets the height.
	$effect(() => {
		void items;
		place();
	});
	$effect(() => watchVisibleArea(place));
	$effect(() => {
		if (!items.length || !input) return;
		const editor = input;
		editor.setAttribute('aria-activedescendant', `${id}-${selected}`);
		return () => editor.removeAttribute('aria-activedescendant');
	});
	$effect(() => {
		void selected;
		box?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
	});

	export function show(next: Item[], at: DOMRect | null, editor: HTMLElement) {
		items = next;
		rect = at;
		input = editor;
		selected = 0;
	}

	/** Handles a key typed in the editor; returns whether the list used it. */
	export function keydown(event: KeyboardEvent): boolean {
		if (items.length === 0) return false;
		if (event.key === 'ArrowDown') selected = (selected + 1) % items.length;
		else if (event.key === 'ArrowUp') selected = (selected - 1 + items.length) % items.length;
		else if (event.key === 'Enter' || event.key === 'Tab') onselect(items[selected]);
		else return false;
		return true;
	}
</script>

{#if rect}
	<div
		class="list"
		bind:this={box}
		style:inset-block-start={placed && `${placed.top}px`}
		style:inset-inline-start={placed && `${placed.left}px`}
	>
		{#if items.length}
			<ul role="listbox" tabindex="-1" aria-label={label}>
				{#each items as item, i (key(item))}
					<li
						id="{id}-{i}"
						role="option"
						aria-selected={i === selected}
						aria-labelledby={labelled ? `${id}-${i}-label` : undefined}
						aria-describedby={labelled ? `${id}-${i}-hint` : undefined}
						onmousemove={() => (selected = i)}
						onmousedown={(event) => {
							// Selecting on mousedown keeps focus in the editor, which drives this list.
							event.preventDefault();
							onselect(item);
						}}
					>
						{@render row(item, `${id}-${i}`)}
					</li>
				{/each}
			</ul>
		{:else}
			<p>{empty}</p>
			{@render actions?.()}
		{/if}
	</div>
{/if}

<style>
	.list {
		position: fixed;
		z-index: var(--z-popover);
		min-inline-size: calc(var(--gap-xl) * 8);
		max-inline-size: calc(100dvw - var(--gap-md) * 2);
		max-block-size: min(calc(var(--gap-xl) * 10), 60dvh);
		overflow-y: auto;
		padding: var(--gap-xs);
		border-radius: var(--radius-surface);
		background-color: var(--hue-z2-bg);
		color: var(--hue-z2-fg);
		box-shadow: var(--elevation-popover);
		line-height: var(--leading-ui);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		padding: var(--gap-sm);
		border-radius: var(--radius-control);
		cursor: pointer;
	}

	li[aria-selected='true'] {
		background-color: var(--hue-selected);
	}

	p {
		margin: 0;
		padding: var(--gap-sm);
		color: var(--hue-z2-muted);
	}
</style>
