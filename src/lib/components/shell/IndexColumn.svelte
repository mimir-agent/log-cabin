<!--
@component
The column an index page's list sits in, after Campsite's `IndexPageContent`: 56rem wide with
its padding, centred, the padding and the gaps between its children growing with the screen
(16 → 24 → 32px). Children stack; a long title inside truncates rather than widening it.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	const { children }: { children: Snippet } = $props();
</script>

<div class="page">
	<div class="column">{@render children()}</div>
</div>

<style>
	.page {
		flex: 1;
		inline-size: 100%;
		min-inline-size: 0;
		max-inline-size: 56rem;
		margin-inline: auto;
		padding: var(--gap-lg);
	}

	.column {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--gap-lg);
		container-type: inline-size;
	}

	@media (min-width: 48rem) {
		.page {
			padding-block: 1.5rem;
		}

		.column {
			gap: 1.5rem;
		}
	}

	@media (min-width: 64rem) {
		.page {
			padding: 2rem 1.5rem;
		}

		.column {
			gap: 2rem;
		}
	}
</style>
