<script lang="ts">
	import { resourceKey } from '#lib/editor/doc.js';
	import { editor as text } from '#lib/strings/editor.js';
	import type { MentionItem } from './extensions.js';
	import SuggestionList from './SuggestionList.svelte';
	import type { SuggestionListExports } from './suggestion-render.js';

	const { onselect }: { onselect: (item: MentionItem) => void } = $props();

	let list: SuggestionListExports<MentionItem>;

	export const show: SuggestionListExports<MentionItem>['show'] = (items, rect, input) =>
		list.show(items, rect, input);
	export const keydown: SuggestionListExports<MentionItem>['keydown'] = (event) =>
		list.keydown(event);
</script>

<SuggestionList
	bind:this={list}
	label={text.mentionList}
	empty={text.mentionEmpty}
	key={(item) => ('kind' in item ? resourceKey(item) : item.id)}
	{onselect}
>
	{#snippet row(item)}
		{#if 'kind' in item}
			{item.title} <span class="kind">{text.resourceMention.kind[item.kind]}</span>
		{:else}
			{item.name}
		{/if}
	{/snippet}
</SuggestionList>

<style>
	.kind {
		color: var(--hue-z2-muted);
	}
</style>
