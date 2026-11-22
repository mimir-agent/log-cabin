<!--
@component
The phone's floating create button: an ink pill above the tab bar, after Campsite's
`FloatingNewDocButton` (CC BY-NC 4.0). Only below 1024px; wider screens keep the action in the
titlebar.
-->
<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { IconName } from '#lib/components/ui/icons/campsite-icons.js';

	/**
	 * icon: plus for something new; the call camera for a call. With an `href` it is a link;
	 * without one it is a button, and `rest` is what opens a menu (a menu trigger's props).
	 */
	type Props = {
		href?: string;
		label: string;
		icon?: IconName;
		rest?: Record<string, unknown>;
	};

	const { href, label, icon = 'plus', rest }: Props = $props();
</script>

{#if href}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass a resolved href -->
	<a class="floating" {href}>
		<Icon name={icon} />
		{label}
	</a>
{:else}
	<button {...rest} type="button" class="floating">
		<Icon name={icon} />
		{label}
	</button>
{/if}

<style>
	.floating {
		position: fixed;
		inset-block-end: calc(4rem + env(safe-area-inset-bottom));
		inset-inline-end: var(--gap-lg);
		z-index: var(--z-sticky);
		display: inline-flex;
		gap: 0.375rem;
		align-items: center;
		block-size: var(--tap-min);
		padding-inline: var(--gap-md) var(--gap-lg);
		border-radius: var(--radius-full);
		background-color: light-dark(var(--hue-black), var(--hue-z2-bg));
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.04),
			inset 0 0 0 0.5px light-dark(transparent, rgb(255 255 255 / 0.08)),
			0 1px 2px rgb(0 0 0 / 0.24),
			0 4px 12px rgb(0 0 0 / 0.16);
		color: var(--hue-white);
		font-size: 0.9375rem;
		font-weight: var(--fw-medium);
		text-decoration: none;
	}

	button.floating {
		border: 0;
		font-family: inherit;
		cursor: pointer;
	}

	.floating:hover,
	.floating:active {
		background-color: var(--hue-gray-800);
	}

	@media (min-width: 64rem) {
		.floating {
			display: none;
		}
	}
</style>
