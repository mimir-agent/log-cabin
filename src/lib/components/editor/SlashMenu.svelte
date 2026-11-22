<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import type { SlashItem } from '#lib/editor/slash.js';
	import { editor as text } from '#lib/strings/editor.js';
	import SuggestionList from './SuggestionList.svelte';
	import type { SuggestionListExports } from './suggestion-render.js';

	const { onselect, onclose }: { onselect: (item: SlashItem) => void; onclose: () => void } =
		$props();

	let list: SuggestionListExports<SlashItem>;

	export const show: SuggestionListExports<SlashItem>['show'] = (items, rect, input) =>
		list.show(items, rect, input);
	export const keydown: SuggestionListExports<SlashItem>['keydown'] = (event) =>
		list.keydown(event);
</script>

<SuggestionList
	bind:this={list}
	label={text.slash.list}
	empty={text.slash.empty}
	key={(item) => item.label}
	labelled
	{onselect}
>
	{#snippet row(item, id)}
		<span class="item">
			<span id="{id}-label">{item.label}</span>
			<span id="{id}-hint" class="hint">{item.hint}</span>
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
			}}>{text.slash.dismiss}</Button
		>
	{/snippet}
</SuggestionList>

<style>
	.item {
		display: flex;
		flex-direction: column;
	}

	.hint {
		color: var(--hue-z2-muted);
	}
</style>
