<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import type { PickerEmoji } from '#lib/emoji/data.js';
	import { editor as text } from '#lib/strings/editor.js';
	import SuggestionList from './SuggestionList.svelte';
	import type { SuggestionListExports } from './suggestion-render.js';

	const { onselect, onclose }: { onselect: (item: PickerEmoji) => void; onclose: () => void } =
		$props();

	let list: SuggestionListExports<PickerEmoji>;

	export const show: SuggestionListExports<PickerEmoji>['show'] = (items, rect, input) =>
		list.show(items, rect, input);
	export const keydown: SuggestionListExports<PickerEmoji>['keydown'] = (event) =>
		list.keydown(event);
</script>

<SuggestionList
	bind:this={list}
	label={text.emojiTool.list}
	empty={text.emojiTool.empty}
	key={(item) => item.value}
	{onselect}
>
	{#snippet row(item)}
		<span class="item">
			<span class="glyph" aria-hidden="true">
				{#if item.url}<img src={item.url} alt="" />{:else}{item.value}{/if}
			</span>
			<span>:{item.name}:</span>
		</span>
	{/snippet}
	{#snippet actions()}
		<Button
			variant="ghost"
			size="sm"
			onmousedown={(event) => {
				// Keeps focus in the editor, which drives the list.
				event.preventDefault();
				onclose();
			}}>{text.emojiTool.dismiss}</Button
		>
	{/snippet}
</SuggestionList>

<style>
	.item {
		display: flex;
		align-items: center;
		gap: var(--gap-sm);
	}

	.glyph {
		display: inline-flex;
		justify-content: center;
		inline-size: 1.5em;
	}

	img {
		inline-size: 1.25em;
		block-size: 1.25em;
		object-fit: contain;
	}
</style>
