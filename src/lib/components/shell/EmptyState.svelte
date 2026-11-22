<!--
@component
What a list says when it has nothing in it, after Campsite's EmptyState and IndexPageEmptyState
(apps/web/components/EmptyState, IndexPages; CC BY-NC 4.0). Centred in the space it's given:
an optional icon, the title in the ink colour at 500, a quieter line under it, then one action.

`size="index"` is the one a whole page's list uses (the feed, notes, calls): 16px, the title in
semibold, 512px wide. The default is the 14px one for a panel or a column.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** What's missing, plainly: "No posts yet". */
		title: string;
		/** One or two sentences on what goes here and how it gets here. */
		description?: string;
		/** An illustration or icon above the title. Optional; most empty states don't need one. */
		icon?: Snippet;
		/** The one action that fills the space, e.g. "New post". */
		action?: Snippet;
		size?: 'base' | 'index';
	};

	let { title, description, icon, action, size = 'base' }: Props = $props();
</script>

<div class="empty" data-size={size}>
	{#if icon}
		<div class="icon">{@render icon()}</div>
	{/if}
	<div class="text">
		<h2 class="title">{title}</h2>
		{#if description}
			<p class="description">{description}</p>
		{/if}
	</div>
	{#if action}
		<div class="action">{@render action()}</div>
	{/if}
</div>

<style>
	/* Fills its column when the column is a flex box, so the message sits in the middle of the
	   empty space rather than at the top of it. */
	.empty {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		inline-size: 100%;
		max-inline-size: 22rem;
		margin-inline: auto;
		padding: var(--gap-4xl) var(--gap-lg);
		text-align: center;
	}

	/* Callers size and colour the icon; at rest it's the ink at 80%, as Campsite's. */
	.icon {
		margin-block-end: var(--gap-lg);
		padding: var(--gap-sm);
		color: color-mix(in srgb, var(--hue-z0-fg) 80%, transparent);
	}

	.text {
		display: grid;
		gap: var(--gap-sm);
	}

	.title {
		margin: 0;
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		line-height: var(--leading-tight);
		text-wrap: balance;
	}

	.description {
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: var(--leading-tight);
		text-wrap: pretty;
	}

	.action {
		margin-block-start: var(--gap-lg);
	}

	.empty[data-size='index'] {
		max-inline-size: 32rem;
	}

	.empty[data-size='index'] .icon {
		margin-block-end: 0;
		padding: 0 0 var(--gap-lg);
	}

	.empty[data-size='index'] .text {
		gap: var(--gap-xs);
	}

	.empty[data-size='index'] :is(.title, .description) {
		font-size: var(--text-md);
		line-height: 1.5;
	}

	.empty[data-size='index'] .title {
		font-weight: var(--fw-semibold);
	}
</style>
