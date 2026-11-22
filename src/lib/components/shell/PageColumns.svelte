<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** reading: centred at --measure, for posts, notes and threads. full: lists and tables. */
		width?: 'reading' | 'full';
		/** The right rail: details, members, related items. Hidden below 72rem. */
		rail?: Snippet;
		/** Labels the rail for screen readers. */
		railLabel?: string;
		children: Snippet;
	};

	let { width = 'full', rail, railLabel, children }: Props = $props();
</script>

<div class="columns" data-rail={rail ? '' : undefined}>
	<div class="body" data-width={width}>
		{@render children()}
	</div>
	{#if rail}
		<aside class="rail" aria-label={railLabel}>
			{@render rail()}
		</aside>
	{/if}
</div>

<style>
	.columns {
		display: grid;
		flex: 1;
		grid-template-columns: minmax(0, 1fr);
		align-items: start;
	}

	.columns[data-rail] {
		grid-template-columns: minmax(0, 1fr) var(--rail-w);
	}

	.body[data-width='reading'] {
		inline-size: 100%;
		max-inline-size: var(--measure);
		margin-inline: auto;
		padding: var(--gap-xl) var(--gap-lg) var(--gap-3xl);
	}

	.rail {
		position: sticky;
		inset-block-start: 0;
		max-block-size: 100dvb;
		padding: var(--gap-lg);
		overflow-y: auto;
		border-inline-start: var(--border-w-hairline) solid var(--hue-z1-border);
		background-color: var(--hue-z1-bg);
		color: var(--hue-z1-fg);
		align-self: stretch;
	}

	@media (max-width: 72rem) {
		.columns[data-rail] {
			grid-template-columns: minmax(0, 1fr);
		}

		.rail {
			display: none;
		}
	}
</style>
