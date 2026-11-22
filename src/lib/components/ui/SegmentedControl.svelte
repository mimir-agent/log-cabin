<script lang="ts" generics="T extends string">
	import { ToggleGroup } from 'bits-ui';
	import Badge from '#lib/components/shell/Badge.svelte';

	type Props = {
		/** The chosen option. Always one: clicking the chosen one again keeps it. */
		value: T;
		/** `count` shows in a badge after the label, when there is one: "Requests 3". */
		options: { value: T; label: string; count?: number }[];
		/** Names the group for screen readers ("Layout", "Theme"). */
		label: string;
		size?: 'sm' | 'md';
		onValueChange?: (value: T) => void;
	};

	let { value = $bindable(), options, label, size = 'md', onValueChange }: Props = $props();
</script>

<ToggleGroup.Root
	type="single"
	bind:value={
		() => value,
		(next) => {
			// A single toggle group lets you clear it; a segmented control never empties.
			if (!next) return;
			value = next as T;
			onValueChange?.(value);
		}
	}
	aria-label={label}
>
	{#snippet child({ props })}
		<div {...props} class="segmented" data-size={size}>
			{#each options as option (option.value)}
				<ToggleGroup.Item value={option.value}>
					{#snippet child({ props })}
						<button {...props} type="button" class="segment">
							{option.label}
							{#if option.count}<Badge>{option.count}</Badge>{/if}
						</button>
					{/snippet}
				</ToggleGroup.Item>
			{/each}
		</div>
	{/snippet}
</ToggleGroup.Root>

<style>
	/* As wide as its segments, even as a grid or flex item that would stretch it to the row. */
	.segmented {
		display: inline-flex;
		inline-size: fit-content;
		max-inline-size: 100%;
		gap: var(--border-w-standard);
		padding: var(--border-w-standard);
		border-radius: var(--radius-control);
		background-color: var(--hue-selected);
	}

	.segment {
		display: inline-flex;
		gap: var(--gap-xs);
		align-items: center;
		block-size: calc(var(--control-h-md) - 2 * var(--border-w-standard));
		padding-inline: var(--gap-md);
		border: 0;
		border-radius: calc(var(--radius-control) - var(--border-w-standard));
		background: none;
		color: var(--hue-z0-muted);
		font: inherit;
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		line-height: var(--leading-ui);
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color var(--motion-fast) var(--motion-ease),
			color var(--motion-fast) var(--motion-ease);
	}

	.segmented[data-size='sm'] .segment {
		block-size: calc(var(--control-h-sm) - 2 * var(--border-w-standard));
		padding-inline: var(--gap-sm);
	}

	.segment:hover {
		color: var(--hue-z0-fg);
	}

	/* The chosen segment lifts onto the raised surface, like a key that stays down. */
	.segment[data-state='on'] {
		background-color: var(--hue-z2-bg);
		color: var(--hue-z0-fg);
		box-shadow: var(--shadow-z1);
	}
</style>
