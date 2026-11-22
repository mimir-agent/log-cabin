<script lang="ts">
	import type { Snippet } from 'svelte';
	import { core } from '#lib/strings/core.js';

	// The frame of the pages people see before they're signed in: sign-in, its follow-up
	// steps and password reset.
	type Props = { title: string; children: Snippet };

	let { title, children }: Props = $props();
</script>

<svelte:head>
	<title>{title} · {core.appName}</title>
</svelte:head>

<div class="l:grid">
	<div class="signed-out l:waterfall" data-grid-columns="half">
		<h1>{title}</h1>
		{@render children()}
	</div>
</div>

<style>
	.signed-out {
		--waterfall-gap: var(--gap-lg);
		padding-block: var(--gap-2xl);
	}

	@media (max-width: 48rem) {
		.signed-out {
			grid-column: span 12;
		}
	}

	/* Labels come from the page's own markup, which this component's scoped rules can't reach. */
	.signed-out :global(label) {
		--waterfall-gap: var(--gap-xs);
		display: block;
	}
</style>
