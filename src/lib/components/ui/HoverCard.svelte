<!--
@component
A card that opens while the pointer rests on, or focus is on, its trigger: Campsite's hover
card on a person's name. The same surface as Popover, on bits-ui's LinkPreview, so the trigger
stays a plain link that a click follows.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { LinkPreview } from 'bits-ui';

	type Props = {
		open?: boolean;
		/** The link that opens it. Spread `props` on your own `<a>`. */
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
		children: Snippet;
		side?: 'top' | 'bottom' | 'left' | 'right';
		align?: 'start' | 'center' | 'end';
		/** Its inline size, a token or length. */
		width?: string;
		onOpenChange?: (open: boolean) => void;
	};

	let {
		open = $bindable(false),
		trigger,
		children,
		side = 'bottom',
		align = 'start',
		width = '18rem',
		onOpenChange
	}: Props = $props();
</script>

<LinkPreview.Root bind:open openDelay={400} {onOpenChange}>
	<LinkPreview.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props })}
		{/snippet}
	</LinkPreview.Trigger>
	<LinkPreview.Portal>
		<LinkPreview.Content {side} {align} sideOffset={6} collisionPadding={8}>
			{#snippet child({ wrapperProps, props })}
				<div {...wrapperProps}>
					<div {...props} class="hover-card" style:--hover-card-w={width}>
						{@render children()}
					</div>
				</div>
			{/snippet}
		</LinkPreview.Content>
	</LinkPreview.Portal>
</LinkPreview.Root>

<style>
	.hover-card {
		/* Copied onto bits-ui's floating wrapper: over sticky bars, as Popover. */
		z-index: var(--z-popover);
		display: grid;
		gap: var(--gap-sm);
		inline-size: min(var(--hover-card-w), calc(100vw - 2 * var(--gap-sm)));
		padding: var(--gap-md);
		border-radius: var(--radius-surface);
		background-color: var(--hue-z2-bg);
		color: var(--hue-z2-fg);
		box-shadow: var(--elevation-popover);
		font-size: var(--type-body);
		transform-origin: var(--bits-link-preview-content-transform-origin);
		transition:
			opacity var(--motion-fast) var(--motion-ease),
			scale var(--motion-fast) var(--motion-ease);

		@starting-style {
			opacity: 0;
			scale: 0.97;
		}
	}
</style>
