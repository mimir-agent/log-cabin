<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** A large title over the feed, from 1024px; below that the bar names the page. */
		title?: string;
		children: Snippet;
	};

	let { title, children }: Props = $props();
</script>

<!-- Campsite's index page: a centred column with generous air above, the composer, then the
     feed. Home and every project share it, so a post list reads the same wherever it is. -->
<div class="page">
	<div class="column">
		{#if title}
			<header class="head">
				<h1 class="title">{title}</h1>
			</header>
		{/if}
		{@render children()}
	</div>
</div>

<style>
	.page {
		flex: 1;
		min-inline-size: 0;
		padding: var(--gap-lg);
	}

	@media (min-width: 48rem) {
		.page {
			padding-block: var(--gap-xl);
		}
	}

	@media (min-width: 64rem) {
		.page {
			padding: 2rem var(--gap-xl);
		}

		/* Home's title sits lower, with Campsite's 64px of air; a project's page starts under its
		   titlebar and needs less. */
		.page:has(.head) {
			padding-block-start: 4rem;
		}
	}

	.column {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--gap-lg);
		align-content: start;
		max-inline-size: var(--measure);
		margin-inline: auto;
	}

	@media (min-width: 48rem) {
		.column {
			gap: var(--gap-xl);
		}
	}

	@media (min-width: 64rem) {
		.column {
			gap: 2rem;
		}
	}

	.head {
		display: none;
	}

	@media (min-width: 64rem) {
		.head {
			display: flex;
		}
	}

	.title {
		margin: 0;
		font-size: 2.25rem;
		font-weight: var(--fw-bold);
		line-height: 2.5rem;
		letter-spacing: -1px;
	}
</style>
