<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
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
			<span class="icon"><Icon name={item.icon} size={20} /></span>
			<span class="text">
				<span id="{id}-label" class="label">{item.label}</span>
				<span id="{id}-hint" class="hint">{item.hint}</span>
			</span>
			{#if item.shortcut}<kbd aria-hidden="true">{item.shortcut}</kbd>{/if}
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
		align-items: center;
		gap: var(--gap-sm);
	}

	/* A 24px box for the 20px glyph, pulled left as Campsite's is. */
	.icon {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		inline-size: 1.5rem;
		block-size: 1.5rem;
		margin-inline-start: calc(var(--gap-xs) * -1);
		color: var(--hue-z0-muted);
	}

	.text {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-inline-size: 0;
	}

	.label {
		font-weight: var(--fw-medium);
	}

	.label,
	.hint {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hint {
		color: var(--hue-z2-muted);
	}

	kbd {
		flex: none;
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm);
		background-color: var(--hue-kbd-bg);
		color: var(--hue-text-secondary);
		font-family: inherit;
		font-size: var(--type-caption);
		font-weight: var(--fw-semibold);
		line-height: 1;
	}

	@media (pointer: coarse) {
		kbd {
			display: none;
		}
	}
</style>
