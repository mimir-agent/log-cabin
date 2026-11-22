<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Props = Omit<HTMLButtonAttributes & HTMLAnchorAttributes, 'type' | 'disabled'> & {
		/**
		 * primary: the screen's main action, once per screen (Post, Save, Send).
		 * secondary: every action that isn't the screen's main one (Cancel, Decline, Invite).
		 * flat: a soft-filled toggle or tab that is on (the selected feed filter).
		 * ghost: actions inside dense UI, toolbars and rows (no border until hover).
		 * danger: an action that destroys or ends something (Delete, End call for everyone).
		 */
		variant?: 'primary' | 'secondary' | 'flat' | 'ghost' | 'danger';
		/** sm 26 for rows and chips, md 30 by default, lg 40 for touch-first places (call controls). */
		size?: 'sm' | 'md' | 'lg';
		/** Pressed state for a toggle (mute, camera off, layout). */
		pressed?: boolean;
		type?: HTMLButtonAttributes['type'];
		disabled?: boolean | null;
		children?: Snippet;
	};

	let {
		variant = 'secondary',
		size = 'md',
		pressed,
		href,
		type = 'button',
		disabled,
		children,
		class: className,
		...rest
	}: Props = $props();
</script>

<!-- A disabled link keeps its role, but loses its href so it can't be followed. -->
<svelte:element
	this={href ? 'a' : 'button'}
	href={href && !disabled ? href : undefined}
	type={href ? undefined : type}
	disabled={href ? undefined : disabled}
	aria-disabled={href ? disabled : undefined}
	aria-pressed={pressed}
	role={href && disabled ? 'link' : undefined}
	tabindex={href && disabled ? -1 : undefined}
	{...rest}
	class={['button', className]}
	data-variant={variant}
	data-size={size}
>
	{@render children?.()}
</svelte:element>

<style>
	/* Campsite's button: 30px, 14px medium, 6px radius. Raised buttons carry their edge in a
	   layered shadow, not a border, and brighten from the top on hover. */
	.button {
		position: relative;
		display: inline-flex;
		flex: none;
		gap: var(--gap-xs);
		align-items: center;
		justify-content: center;
		block-size: var(--control-h-sm);
		padding-inline: 0.625rem;
		border: 0;
		border-radius: var(--radius-control);
		background-color: var(--hue-z2-bg);
		box-shadow: var(--shadow-button);
		color: var(--hue-z0-fg);
		font-family: inherit;
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		line-height: var(--leading-ui);
		white-space: nowrap;
		text-decoration: none;
		cursor: pointer;
		user-select: none;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	/* The top-lit sheen on hover, as in Campsite: a white gradient fading in over the fill. */
	.button::before {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background-image: linear-gradient(to bottom, rgb(255 255 255 / 0.12), transparent);
		opacity: 0;
		content: '';
		pointer-events: none;
		transition: opacity var(--motion-fast) var(--motion-ease);
	}

	.button:hover:not(:disabled, [aria-disabled='true'])::before {
		opacity: 1;
	}

	.button[data-variant='secondary'] {
		background-color: light-dark(var(--hue-white), var(--hue-gray-750));
	}

	.button[data-variant='primary'] {
		background-color: var(--hue-accent);
		box-shadow: var(--shadow-button-primary);
		color: var(--hue-accent-fg);
	}

	.button[data-variant='primary']:hover:not(:disabled, [aria-disabled='true']) {
		background-color: var(--hue-accent-hover);
	}

	.button[data-variant='flat'] {
		background-color: var(--hue-fill);
		box-shadow: none;
	}

	.button[data-variant='ghost'] {
		background-color: transparent;
		box-shadow: none;
	}

	.button:is([data-variant='flat'], [data-variant='ghost'])::before {
		display: none;
	}

	.button[data-variant='ghost']:hover:not(:disabled, [aria-disabled='true']),
	.button[data-variant='ghost'][data-state='open'] {
		background-color: var(--hue-fill);
	}

	.button[data-variant='flat']:hover:not(:disabled, [aria-disabled='true']) {
		background-color: var(--hue-pressed);
	}

	.button[data-variant='danger'] {
		background-color: var(--hue-danger-solid);
		box-shadow: none;
		color: var(--hue-white);
	}

	.button[data-size='sm'] {
		block-size: var(--control-h-xs);
		padding-inline: var(--gap-sm);
		border-radius: var(--radius-xs, 0.25rem);
		font-size: 0.8125rem;
	}

	.button[data-size='lg'] {
		block-size: var(--control-h-lg);
		padding-inline: var(--gap-xl);
		border-radius: var(--radius-surface);
		font-size: var(--type-prose);
	}

	/* A finger needs --tap-min. The real box grows, so a tap on one button's face can't reach
	   its neighbour (a larger hit area would, when the gap is under half the growth). */
	@media (pointer: coarse) {
		.button {
			min-block-size: var(--tap-min);
			min-inline-size: var(--tap-min);
		}
	}

	/* Press: a small give, so the click is felt. Not on toggles, whose state change is the answer. */
	.button:active:not(:disabled, [aria-disabled='true'], [aria-pressed]) {
		transform: scale(var(--press-scale));
	}

	.button[aria-pressed='true'] {
		background-color: var(--hue-selected);
		box-shadow: none;
	}

	.button:disabled,
	.button[aria-disabled='true'] {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
