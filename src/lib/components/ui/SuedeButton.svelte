<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Props = Omit<HTMLButtonAttributes & HTMLAnchorAttributes, 'type' | 'disabled'> & {
		type?: HTMLButtonAttributes['type'];
		disabled?: boolean | null;
		children?: Snippet;
	};

	let { href, type = 'button', disabled, children, class: className, ...rest }: Props = $props();
</script>

<!-- A disabled link keeps its link role and styling, but loses its href so it can't be followed. -->
<svelte:element
	this={href ? 'a' : 'button'}
	href={href && !disabled ? href : undefined}
	type={href ? undefined : type}
	disabled={href ? undefined : disabled}
	aria-disabled={href ? disabled : undefined}
	role={href && disabled ? 'link' : undefined}
	tabindex={href && disabled ? -1 : undefined}
	{...rest}
	class={`suede-button${className ? ` ${className}` : ''}`}
>
	{@render children?.()}
</svelte:element>

<style>
	/* The screen's main action: Campsite's primary button. Ink, 30px, 14px medium. */
	.suede-button {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		gap: var(--gap-xs);
		block-size: var(--control-h-sm);
		padding: 0 0.625rem;
		border: 0;
		border-radius: var(--radius-control);
		background-color: var(--hue-accent);
		box-shadow: var(--shadow-button-primary);
		color: var(--hue-accent-fg);
		font-family: var(--ff-ui);
		font-size: var(--text-sm);
		font-weight: var(--fw-medium);
		line-height: var(--leading-ui);
		white-space: nowrap;
		cursor: pointer;
		text-decoration: none;
		user-select: none;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	button.suede-button:hover:not(:disabled) {
		background-color: var(--hue-accent-hover);
	}

	button.suede-button:active:not(:disabled) {
		transform: scale(var(--press-scale));
	}

	a.suede-button {
		background-color: transparent;
		box-shadow: none;
		color: var(--hue-link);
		padding-inline: 0;
		text-decoration: underline;
		text-decoration-thickness: from-font;
		text-underline-offset: 0.2em;
	}

	a.suede-button:hover:not([aria-disabled='true']) {
		color: var(--hue-link-active);
	}

	.suede-button:disabled,
	.suede-button[aria-disabled='true'] {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (pointer: coarse) {
		.suede-button {
			min-block-size: var(--tap-min);
			min-inline-size: var(--tap-min);
		}
	}
</style>
