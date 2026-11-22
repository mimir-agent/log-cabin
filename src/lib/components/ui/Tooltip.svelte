<!--
@component
A small label that shows while the pointer rests on, or focus is on, its trigger, with the
keys that do the same thing after it when given: Campsite's `tooltip` and `tooltipShortcut`.
Built on bits-ui's Tooltip; the trigger stays your own button.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Tooltip } from 'bits-ui';

	type Props = {
		open?: boolean;
		/** What the trigger does. */
		label: string;
		/** Its keys, written for each platform; the one for this device shows. */
		shortcut?: { apple: string; other: string };
		/** The element it is for. Spread `props` on your own button. */
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
		side?: 'top' | 'bottom' | 'left' | 'right';
		disabled?: boolean;
	};

	let {
		open = $bindable(false),
		label,
		shortcut,
		trigger,
		side = 'top',
		disabled
	}: Props = $props();
</script>

<Tooltip.Provider>
	<Tooltip.Root bind:open>
		<Tooltip.Trigger {disabled}>
			{#snippet child({ props })}
				{@render trigger({ props })}
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Portal>
			<Tooltip.Content {side} sideOffset={4}>
				{#snippet child({ wrapperProps, props })}
					{@const apple = /Mac|iPhone|iPad/.test(navigator.userAgent)}
					<div {...wrapperProps}>
						<div {...props} role="tooltip" class="tooltip">
							{label}
							{#if shortcut}<kbd>{apple ? shortcut.apple : shortcut.other}</kbd>{/if}
						</div>
					</div>
				{/snippet}
			</Tooltip.Content>
		</Tooltip.Portal>
	</Tooltip.Root>
</Tooltip.Provider>

<style>
	.tooltip {
		/* Copied onto bits-ui's floating wrapper: over sticky bars and dialogs, as Popover. */
		z-index: var(--z-popover);
		display: flex;
		gap: var(--gap-sm);
		align-items: baseline;
		padding: var(--gap-xs) var(--gap-sm);
		border-radius: var(--radius-control);
		background-color: var(--hue-accent);
		color: var(--hue-accent-fg);
		font-size: var(--type-caption);
	}
</style>
