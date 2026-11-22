<!--
@component
A list of commands from a button, after Campsite's DropdownMenu (packages/ui/src/DropdownMenu and
Menu, CC BY-NC 4.0): a 220px panel 8px under its button, 34px rows with a 20px icon in the third
grey, and a destructive row that turns red only when it's highlighted. Below 1024px it is
Campsite's drawer instead: a sheet from the bottom of the screen with 44px rows at 16px.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { DropdownMenu } from 'bits-ui';

	type Props = {
		open?: boolean;
		/** The button that opens it. Spread `props` on your own button. */
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
		/**
		 * bits-ui's own parts: DropdownMenu.Item, .RadioGroup with .RadioItem, .CheckboxItem,
		 * .Separator, .GroupHeading, .Sub. They pick up this surface's styles. Start an item with
		 * an <Icon> and it gets the icon column; give it `data-tone="danger"` when it destroys
		 * something; end it with `<kbd data-menu-shortcut>` for a key, or `<span data-menu-hint>`
		 * for a quiet word ("Default").
		 */
		children: Snippet;
		/**
		 * A row above the items: Campsite puts a message's quick reactions there. Shown when the
		 * menu is a sheet (below 1024px) and on any touch screen. Plain buttons, not items.
		 */
		sheetHeader?: Snippet;
		side?: 'top' | 'bottom' | 'left' | 'right';
		align?: 'start' | 'center' | 'end';
		/** At least this wide; long device names and labels make it wider, up to 20rem. */
		minWidth?: string;
	};

	let {
		open = $bindable(false),
		trigger,
		children,
		sheetHeader,
		side = 'bottom',
		align = 'start',
		minWidth = '13.75rem'
	}: Props = $props();
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			{@render trigger({ props })}
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		{#if open}<div class="backdrop" aria-hidden="true"></div>{/if}
		<DropdownMenu.Content {side} {align} sideOffset={8} collisionPadding={8}>
			{#snippet child({ wrapperProps, props })}
				<div {...wrapperProps} class="wrapper">
					<div {...props} class="menu" style:--menu-min-w={minWidth}>
						<div class="handle" aria-hidden="true"></div>
						{#if sheetHeader}<div class="sheet-header">{@render sheetHeader()}</div>{/if}
						{@render children()}
					</div>
				</div>
			{/snippet}
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
	.backdrop,
	.sheet-header,
	.handle {
		display: none;
	}

	.menu {
		/* bits-ui copies this onto its floating wrapper, which lifts the menu over sticky bars
		   (titlebars, day headings) that it opens across. */
		z-index: var(--z-popover);
		display: grid;
		min-inline-size: var(--menu-min-w);
		max-inline-size: min(20rem, calc(100vw - 2 * var(--gap-sm)));
		max-block-size: var(--bits-dropdown-menu-content-available-height, 70vh);
		padding: var(--gap-xs);
		overflow-y: auto;
		border: var(--border-w-hairline) solid var(--hue-menu-border);
		border-radius: var(--radius-surface);
		background-color: var(--hue-z2-bg);
		color: var(--hue-z2-fg);
		box-shadow: var(--shadow-menu);
		font-size: var(--type-body);
		transform-origin: var(--bits-dropdown-menu-content-transform-origin);
		transition:
			opacity var(--motion-fast) var(--motion-ease-out),
			scale var(--motion-fast) var(--motion-ease-out);

		@starting-style {
			opacity: 0;
			scale: 0.98;
		}
	}

	.menu:focus-visible {
		outline: none;
	}

	/* Every kind of item is the same row: an icon or check column, the label, a trailing hint. */
	.menu
		:global(
			:is(
				[data-dropdown-menu-item],
				[data-dropdown-menu-radio-item],
				[data-dropdown-menu-checkbox-item],
				[data-dropdown-menu-sub-trigger]
			)
		) {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		/* A form button doesn't stretch on its own; every row spans the menu. */
		inline-size: 100%;
		min-block-size: 2.125rem;
		padding-inline: 0.625rem 0.75rem;
		border: 0;
		border-radius: 0.3125rem;
		background-color: transparent;
		color: inherit;
		font: inherit;
		line-height: var(--leading-tight);
		/* Items can be links or form buttons: neither brings its own look into the menu. */
		text-align: start;
		text-decoration: none;
		cursor: pointer;
		user-select: none;
		outline: none;
	}

	/* A leading icon starts 6px in; Campsite's 20px icons carry their own air. */
	.menu
		:global(
			:is([data-dropdown-menu-item], [data-dropdown-menu-sub-trigger]):has(> .icon:first-child)
		) {
		padding-inline-start: 0.375rem;
	}

	.menu :global(:is([data-dropdown-menu-item], [data-dropdown-menu-sub-trigger]) > .icon) {
		flex: none;
		color: var(--hue-z0-muted);
		transition: color var(--motion-fast) var(--motion-ease);
	}

	/* Radio and checkbox items keep a column for the mark, so labels line up checked or not. */
	.menu :global(:is([data-dropdown-menu-radio-item], [data-dropdown-menu-checkbox-item])) {
		padding-inline-start: calc(0.625rem + 1em + var(--gap-sm));
		position: relative;
	}

	.menu
		:global(
			:is([data-dropdown-menu-radio-item], [data-dropdown-menu-checkbox-item])[data-state='checked']
		)::before {
		content: '';
		position: absolute;
		inset-inline-start: 0.625rem;
		inline-size: 1em;
		block-size: 1em;
		background-color: currentColor;
		mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-7' fill='none' stroke='black' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
			center / contain no-repeat;
	}

	.menu :global([data-highlighted]) {
		background-color: var(--hue-menu-highlight);
		box-shadow: var(--shadow-select-item);
	}

	.menu :global([data-disabled]) {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* A destructive row looks like the rest until it is the one about to happen. */
	.menu :global([data-tone='danger'][data-highlighted]) {
		background-color: var(--hue-danger-fill);
		color: var(--hue-white);
	}

	.menu :global([data-tone='danger'][data-highlighted] > .icon) {
		color: inherit;
	}

	.menu :global([data-dropdown-menu-separator]) {
		block-size: 1px;
		margin-block: var(--gap-xs);
		margin-inline: calc(var(--gap-xs) * -1);
		background-color: var(--hue-menu-separator);
	}

	.menu :global([data-dropdown-menu-group-heading]) {
		padding: var(--gap-sm) var(--gap-md) var(--gap-xs);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		line-height: var(--leading-tight);
	}

	/* A submenu opens inside its menu's panel as a panel of its own, the same surface beside it.
	   Its rows are the menu's rows. */
	.menu :global([data-menu-sub]) {
		z-index: var(--z-popover);
		display: grid;
		min-inline-size: var(--menu-min-w);
		padding: var(--gap-xs);
		border: var(--border-w-hairline) solid var(--hue-menu-border);
		border-radius: var(--radius-surface);
		background-color: var(--hue-z2-bg);
		color: var(--hue-z2-fg);
		box-shadow: var(--shadow-menu);
	}

	.menu :global([data-menu-sub]:focus-visible) {
		outline: none;
	}

	/* A word at the end of a row: a count, "Default". */
	.menu :global([data-menu-hint]) {
		margin-inline-start: auto;
		padding-inline-start: var(--gap-md);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}

	.menu :global([data-highlighted] [data-menu-hint]) {
		color: inherit;
	}

	/* A key at the end of a row, in Campsite's chip: 12px semibold in the second grey. */
	.menu :global([data-menu-shortcut]) {
		margin-inline-start: auto;
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm);
		background-color: var(--hue-kbd-bg);
		color: var(--hue-text-secondary);
		font-family: inherit;
		font-size: var(--type-caption);
		font-weight: var(--fw-semibold);
		line-height: 1;
	}

	/* A message's quick reactions sit on top of its menu below 1024px, where the menu is a sheet,
	   and on any touch screen, where the actions beside the message are hidden and this menu is
	   the only way to react. A touch screen 1024px or wider gets the dropdown, wide enough for
	   the buttons at thumb size. */
	@media (max-width: 63.99rem), (hover: none) and (pointer: coarse) {
		.sheet-header {
			display: flex;
			gap: var(--gap-xs);
			justify-content: space-between;
			max-inline-size: 24rem;
			margin-inline: auto;
			padding: var(--gap-xs) var(--gap-md) var(--gap-md);
		}
	}

	@media (min-width: 64rem) and (hover: none) and (pointer: coarse) {
		.menu:has(> .sheet-header) {
			min-inline-size: 20rem;
		}
	}

	/* Campsite's drawer: below 1024px a menu is a sheet from the bottom edge, its rows big
	   enough for a thumb, over a dimmed page. bits-ui still places the wrapper; these rules
	   take it out of that placement. */
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

		.wrapper,
		.menu :global([data-menu-sub-wrapper]) {
			position: fixed !important;
			inset: auto 0 0 !important;
			min-inline-size: 0 !important;
			transform: none !important;
		}

		/* A submenu is a second sheet over the first. */
		.menu :global([data-menu-sub]) {
			min-inline-size: 0;
			padding: 0 0 max(var(--gap-sm), calc(var(--gap-xs) + env(safe-area-inset-bottom)));
			border: 0;
			border-radius: 0.75rem 0.75rem 0 0;
			color: var(--hue-text-secondary);
			box-shadow: none;
		}

		.menu {
			min-inline-size: 0;
			max-inline-size: none;
			max-block-size: 95dvh;
			padding: 0 0 max(var(--gap-sm), calc(var(--gap-xs) + env(safe-area-inset-bottom)));
			border: 0;
			border-radius: 0.75rem 0.75rem 0 0;
			color: var(--hue-text-secondary);
			box-shadow: none;
			transition: translate var(--motion-slow) var(--motion-ease-out);

			@starting-style {
				opacity: 1;
				scale: 1;
				translate: 0 100%;
			}
		}

		.handle {
			display: block;
			inline-size: 2rem;
			block-size: 0.25rem;
			margin: var(--gap-sm) auto;
			border-radius: var(--radius-full);
			background-color: var(--hue-z0-fg);
			opacity: 0.2;
		}

		.menu
			:global(
				:is(
					[data-dropdown-menu-item],
					[data-dropdown-menu-radio-item],
					[data-dropdown-menu-checkbox-item],
					[data-dropdown-menu-sub-trigger]
				)
			) {
			gap: 0.625rem;
			min-block-size: var(--tap-min);
			padding-inline: var(--gap-lg);
			border-radius: 0;
			font-size: var(--text-md);
			font-weight: var(--fw-medium);
		}

		.menu
			:global(
				:is([data-dropdown-menu-item], [data-dropdown-menu-sub-trigger]):has(> .icon:first-child)
			) {
			padding-inline-start: var(--gap-lg);
		}

		.menu :global(:is([data-dropdown-menu-radio-item], [data-dropdown-menu-checkbox-item])) {
			padding-inline-start: calc(var(--gap-lg) + 1em + 0.625rem);
		}

		.menu
			:global(
				:is(
					[data-dropdown-menu-radio-item],
					[data-dropdown-menu-checkbox-item]
				)[data-state='checked']
			)::before {
			inset-inline-start: var(--gap-lg);
		}

		.menu :global(:is([data-dropdown-menu-item], [data-dropdown-menu-sub-trigger]) > .icon) {
			color: var(--hue-gray-400);
			scale: 1.25;
		}

		/* On a phone the press is the highlight: nothing stays lit, and nothing turns red. A
		   narrow window with a mouse and keyboard keeps the highlight, the only sign of the
		   current row. */
		@media (hover: none) and (pointer: coarse) {
			.menu :global([data-highlighted]),
			.menu :global([data-tone='danger'][data-highlighted]) {
				background-color: transparent;
				color: inherit;
				box-shadow: none;
			}
		}

		.menu
			:global(
				:is(
					[data-dropdown-menu-item],
					[data-dropdown-menu-radio-item],
					[data-dropdown-menu-checkbox-item]
				):active
			) {
			background-color: var(--hue-menu-highlight);
		}

		.menu :global([data-dropdown-menu-separator]) {
			margin-inline: 0;
		}

		.menu :global([data-dropdown-menu-group-heading]) {
			padding-inline: var(--gap-lg);
		}

		.menu :global([data-menu-shortcut]) {
			display: none;
		}
	}
</style>
