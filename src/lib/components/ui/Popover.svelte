<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Popover } from 'bits-ui';

	type Props = {
		open?: boolean;
		/** The button that opens it. Spread `props` on your own button. */
		trigger?: Snippet<[{ props: Record<string, unknown> }]>;
		/**
		 * What it is placed against when it has no trigger, such as words in a text; it is
		 * opened and closed through `open`, and leaves focus where it is, in the text.
		 */
		anchor?: HTMLElement | null;
		children: Snippet;
		side?: 'top' | 'bottom' | 'left' | 'right';
		align?: 'start' | 'center' | 'end';
		/** Its inline size, a token or length. Content wider than the screen wraps to it. */
		width?: string;
		/** Space inside the edge. none for content that brings its own (a list, the emoji grid). */
		padding?: 'none' | 'md';
		/** Names it for screen readers when there is no heading inside. */
		label?: string;
		/** The element it stays inside, such as the content column; the screen when unset. */
		boundary?: Element | null;
		/** Below 1024px, a sheet from the bottom of the screen over a dimmed page, as Menu. */
		sheet?: boolean;
		/** Called as it closes, where focus would go back to the trigger; `preventDefault` to place it elsewhere. */
		onCloseAutoFocus?: (event: Event) => void;
		onOpenChange?: (open: boolean) => void;
	};

	let {
		open = $bindable(false),
		trigger,
		anchor = null,
		children,
		side = 'bottom',
		align = 'start',
		width = '18rem',
		padding = 'md',
		label,
		boundary = null,
		sheet = false,
		onCloseAutoFocus,
		onOpenChange
	}: Props = $props();
</script>

<Popover.Root bind:open {onOpenChange}>
	{#if trigger}
		<Popover.Trigger>
			{#snippet child({ props })}
				{@render trigger({ props })}
			{/snippet}
		</Popover.Trigger>
	{/if}
	<Popover.Portal>
		{#if sheet && open}<div class="backdrop" aria-hidden="true"></div>{/if}
		<Popover.Content
			{side}
			{align}
			sideOffset={4}
			customAnchor={anchor}
			trapFocus={!anchor}
			onOpenAutoFocus={(event) => anchor && event.preventDefault()}
			onCloseAutoFocus={(event) => {
				if (anchor) event.preventDefault();
				onCloseAutoFocus?.(event);
			}}
			collisionBoundary={boundary}
			collisionPadding={8}
		>
			{#snippet child({ wrapperProps, props })}
				<div {...wrapperProps} class="wrapper" data-sheet={sheet || undefined}>
					<div
						{...props}
						class="popover"
						data-padding={padding}
						style:--popover-w={width}
						aria-label={label}
					>
						{@render children()}
					</div>
				</div>
			{/snippet}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

<style>
	.backdrop {
		display: none;
	}

	.popover {
		/* Copied onto bits-ui's floating wrapper: over sticky bars, as Menu. */
		z-index: var(--z-popover);
		inline-size: min(var(--popover-w), calc(100vw - 2 * var(--gap-sm)));
		max-block-size: var(--bits-popover-content-available-height, 70vh);
		overflow-y: auto;
		border-radius: var(--radius-surface);
		background-color: var(--hue-z2-bg);
		color: var(--hue-z2-fg);
		box-shadow: var(--elevation-popover);
		font-size: var(--type-body);
		/* Grows from the edge it is attached to, so it reads as coming out of its button. */
		transform-origin: var(--bits-popover-content-transform-origin);
		transition:
			opacity var(--motion-fast) var(--motion-ease),
			scale var(--motion-fast) var(--motion-ease);

		@starting-style {
			opacity: 0;
			scale: 0.97;
		}
	}

	.popover[data-padding='md'] {
		padding: var(--gap-md);
	}

	.popover:focus-visible {
		outline: none;
	}

	/* Campsite's sheet: bits-ui still places the wrapper; these rules take it out of that
	   placement and pin it to the bottom edge, full width. */
	@media (max-width: 63.99rem) {
		.backdrop {
			display: block;
			position: fixed;
			inset: 0;
			z-index: var(--z-popover);
			background-color: var(--hue-backdrop-sheet);
			transition: opacity var(--motion-base) var(--motion-ease);

			@starting-style {
				opacity: 0;
			}
		}

		.wrapper[data-sheet] {
			position: fixed !important;
			inset: auto 0 0 !important;
			min-inline-size: 0 !important;
			transform: none !important;
		}

		[data-sheet] .popover {
			inline-size: auto;
			max-block-size: 95dvh;
			padding-block-end: var(--safe-bottom);
			border-radius: var(--radius-card) var(--radius-card) 0 0;
			box-shadow: none;
			transition: translate var(--motion-slow) var(--motion-ease-out);

			@starting-style {
				opacity: 1;
				scale: 1;
				translate: 0 100%;
			}
		}
	}
</style>
