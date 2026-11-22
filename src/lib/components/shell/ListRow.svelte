<script lang="ts">
	import type { Snippet } from 'svelte';
	import { navigating } from '$app/state';
	import UnreadDot from './UnreadDot.svelte';

	type Props = {
		/** Makes the whole row a link. Without it the row is static. */
		href?: string;
		/** An Avatar (size sm or md) or icon. */
		leading?: Snippet;
		/** One line under the title: an excerpt, a project, who replied. */
		description?: Snippet;
		/** Right-aligned metadata: a <time>, a count, facepile. */
		meta?: Snippet;
		unread?: boolean;
		/** The row the keyboard or the open detail pane is on. */
		selected?: boolean;
		/** The title line. */
		children: Snippet;
	};

	let {
		href,
		leading,
		description,
		meta,
		unread = false,
		selected = false,
		children
	}: Props = $props();
</script>

<!-- Callers pass resolved paths. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<svelte:element
	this={href ? 'a' : 'div'}
	{href}
	class="row"
	data-unread={unread ? '' : undefined}
	data-selected={selected ? '' : undefined}
	data-pending={(href && navigating.to?.url.pathname === href) || undefined}
	aria-current={href && selected ? 'true' : undefined}
	data-focus="inset"
>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{#if leading}<span class="leading">{@render leading()}</span>{/if}
	<span class="text">
		<span class="title">{@render children()}</span>
		{#if description}<span class="description">{@render description()}</span>{/if}
	</span>
	{#if meta}<span class="meta">{@render meta()}</span>{/if}
	{#if unread}<UnreadDot />{/if}
</svelte:element>

<style>
	.row {
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		min-block-size: var(--control-h-lg);
		padding: var(--gap-sm) var(--gap-lg);
		color: inherit;
		font-size: var(--type-body);
		line-height: var(--leading-tight);
		text-decoration: none;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	a.row:hover {
		background-color: var(--hue-hover);
	}

	.row[data-selected] {
		background-color: var(--hue-selected);
	}

	a.row:active,
	a.row[data-pending] {
		background-color: var(--hue-pressed);
		transition-duration: var(--motion-instant);
	}

	.leading {
		display: flex;
		flex: none;
		align-self: start;
	}

	.text {
		display: grid;
		flex: 1;
		min-inline-size: 0;
	}

	.title,
	.description {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row[data-unread] .title {
		font-weight: var(--fw-medium);
	}

	.description,
	.meta {
		color: var(--hue-z0-muted);
	}

	.meta {
		display: flex;
		flex: none;
		gap: var(--gap-sm);
		align-items: center;
		font-size: var(--type-caption);
		font-variant-numeric: tabular-nums;
	}
</style>
