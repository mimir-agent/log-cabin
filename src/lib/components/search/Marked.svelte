<script lang="ts">
	import { markedParts } from '#lib/search.js';

	/** Text from search, with matched words between the search marks. */
	let { text }: { text: string } = $props();
</script>

{#each markedParts(text) as part, i (i)}{#if part.match}<mark>{part.text}</mark
		>{:else}{part.text}{/if}{/each}

<style>
	mark {
		background-color: var(--hue-highlight);
		color: var(--hue-highlight-fg);
		border-radius: var(--radius-xs);
	}
</style>
