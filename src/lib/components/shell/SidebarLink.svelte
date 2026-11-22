<script lang="ts">
	import type { Snippet } from 'svelte';
	import { shell } from '#lib/strings/shell.js';

	type Props = {
		href: string;
		current?: boolean;
		/** Unread count; shown as a badge when above zero. */
		count?: number;
		/** Something new in it: the label goes heavy and full-strength. */
		unread?: boolean;
		/** An icon, avatar or project mark before the label, in a 20px box. */
		leading?: Snippet;
		children: Snippet;
	};

	let { href, current = false, count = 0, unread = false, leading, children }: Props = $props();
</script>

<!-- Callers pass resolved paths: nav items are registered in #lib/nav, projects come from data. -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	class="link"
	{href}
	aria-current={current ? 'page' : undefined}
	data-unread={unread ? '' : undefined}
	data-focus="inset"
>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{#if leading}<span class="leading">{@render leading()}</span>{/if}
	<span class="label">{@render children()}</span>
	{#if count > 0}
		<span class="count">
			<span aria-hidden="true">{count}</span>
			<span class="u:visually-hidden">{shell.unread(count)}</span>
		</span>
	{/if}
</a>

<style>
	/* Campsite's sidebar row: 30px, 6px padding and radius, 20px icon, 14px medium label in the
	   tertiary grey. Hover and the current page are a grey fill and full-strength text. No
	   transition: the fill is there the moment the pointer is. */
	.link {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		block-size: var(--control-h-sm);
		padding: 0.375rem;
		border-radius: var(--radius-control);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		line-height: 1.25rem;
		text-decoration: none;
	}

	.link:hover,
	.link[aria-current='page'] {
		background-color: var(--hue-selected);
		color: var(--hue-z0-fg);
	}

	.link:active {
		background-color: var(--hue-pressed);
		color: var(--hue-z0-fg);
	}

	.leading {
		display: grid;
		flex: none;
		place-items: center;
		inline-size: 1.25rem;
		block-size: 1.25rem;
	}

	.label {
		flex: 1;
		overflow: hidden;
		opacity: 0.85;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.link:hover .label,
	.link[data-unread] .label {
		opacity: 1;
	}

	.link[data-unread] {
		color: var(--hue-z0-fg);
	}

	.link[data-unread] .label {
		font-weight: 750;
	}

	/* The count: a small mono pill, quiet unless something calls for attention. */
	.count {
		flex: none;
		padding: 1px 0.375rem;
		border-radius: var(--radius-full);
		background-color: var(--hue-selected);
		color: var(--hue-text-secondary);
		font-family: var(--ff-mono);
		font-size: 0.625rem;
		font-weight: var(--fw-bold);
		line-height: 0.9375rem;
	}

	.link:hover .count,
	.link[aria-current='page'] .count {
		background-color: light-dark(var(--hue-gray-200), var(--hue-gray-700));
	}
</style>
