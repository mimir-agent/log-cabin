<!--
@component
A square button or link holding one icon: toolbars, the sidebar header, row actions. Plain by
default (no fill until hovered). `label` is required: it is the accessible name and the tooltip.
-->
<script lang="ts">
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons/campsite-icons.js';

	type Props = Omit<HTMLButtonAttributes & HTMLAnchorAttributes, 'type' | 'children'> & {
		icon: IconName;
		label: string;
		href?: string;
		type?: HTMLButtonAttributes['type'];
		/** sm 26 · md 30 (default) · lg 40 */
		size?: 'sm' | 'md' | 'lg';
		/** plain: no fill at rest. flat: a soft fill at rest. */
		variant?: 'plain' | 'flat';
		/** The icon in the tertiary grey until hovered. */
		quiet?: boolean;
		round?: boolean;
		iconSize?: number;
	};

	let {
		icon,
		label,
		href,
		type = 'button',
		size = 'md',
		variant = 'plain',
		quiet = false,
		round = false,
		iconSize,
		...rest
	}: Props = $props();
</script>

<svelte:element
	this={href ? 'a' : 'button'}
	{href}
	type={href ? undefined : type}
	aria-label={label}
	title={label}
	{...rest}
	class="icon-button"
	data-size={size}
	data-variant={variant}
	data-quiet={quiet ? '' : undefined}
	data-round={round ? '' : undefined}
>
	<Icon name={icon} size={iconSize ?? (size === 'lg' ? 24 : 20)} />
</svelte:element>

<style>
	.icon-button {
		--size: var(--control-h-sm);
		display: inline-grid;
		flex: none;
		place-items: center;
		inline-size: var(--size);
		block-size: var(--size);
		padding: 0;
		border: 0;
		border-radius: var(--radius-control);
		background-color: transparent;
		color: inherit;
		cursor: pointer;
		text-decoration: none;
	}

	.icon-button[data-size='sm'] {
		--size: var(--control-h-xs);
	}

	.icon-button[data-size='lg'] {
		--size: var(--control-h-lg);
		border-radius: var(--radius-surface);
	}

	.icon-button[data-round] {
		border-radius: var(--radius-full);
	}

	/* A finger needs --tap-min. The real box grows, so a tap on one button's face can't reach
	   its neighbour (a larger hit area would, when the gap is under half the growth). */
	@media (pointer: coarse) {
		.icon-button {
			min-inline-size: var(--tap-min);
			min-block-size: var(--tap-min);
		}
	}

	.icon-button[data-variant='flat'] {
		background-color: var(--hue-fill);
	}

	.icon-button[data-quiet] {
		color: var(--hue-z0-muted);
	}

	.icon-button:hover:not(:disabled),
	.icon-button[aria-expanded='true'],
	.icon-button[data-state='open'] {
		background-color: var(--hue-fill);
		color: var(--hue-z0-fg);
	}

	.icon-button[data-variant='flat']:hover:not(:disabled) {
		background-color: var(--hue-pressed);
	}

	/* Held down: a firmer fill, on touch too, where there is no hover. */
	.icon-button:active:not(:disabled) {
		background-color: var(--hue-pressed);
		color: var(--hue-z0-fg);
	}

	/* A link to the page you're on, such as Activity in the sidebar's header, holds the same
	   soft fill as an open menu's button: on wide screens it's the only sign of where you are. */
	.icon-button[aria-current='page'] {
		background-color: var(--hue-fill);
		color: var(--hue-z0-fg);
	}

	.icon-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
