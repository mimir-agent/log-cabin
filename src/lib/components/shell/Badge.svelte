<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** neutral for counts and labels; unread for unread counts; danger for errors. */
		tone?: 'neutral' | 'unread' | 'danger';
		/** Read by screen readers instead of the visible text, e.g. "3 unread" for "3". */
		label?: string;
		children: Snippet;
	};

	let { tone = 'neutral', label, children }: Props = $props();
</script>

{#if label}
	<span class="badge" data-tone={tone}>
		<span aria-hidden="true">{@render children()}</span>
		<span class="u:visually-hidden">{label}</span>
	</span>
{:else}
	<span class="badge" data-tone={tone}>{@render children()}</span>
{/if}

<style>
	.badge {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		min-inline-size: calc(var(--gap-lg) + var(--gap-xs));
		block-size: calc(var(--gap-lg) + var(--gap-xs));
		padding-inline: var(--gap-xs);
		border-radius: var(--radius-full);
		background-color: var(--hue-selected);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-variant-numeric: tabular-nums;
		font-weight: var(--fw-medium);
		line-height: var(--leading-ui);
		white-space: nowrap;
	}

	.badge[data-tone='unread'] {
		background-color: var(--hue-unread);
		color: var(--hue-accent-fg);
	}

	.badge[data-tone='danger'] {
		background-color: var(--hue-danger-subtle);
		color: var(--hue-danger);
	}
</style>
