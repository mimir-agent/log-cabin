<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Toolbar } from 'bits-ui';

	type Props = {
		/** Read by screen readers and shown as a tooltip; required when the button is icon-only. */
		label: string;
		/** For toggles like Bold: the button shows as on and reports aria-pressed. */
		pressed?: boolean;
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		/** An icon (16px, 1.5 stroke) or a short word. */
		children: Snippet;
	};

	let { label, pressed, disabled = false, onclick, children }: Props = $props();
</script>

<Toolbar.Button {disabled} {onclick}>
	{#snippet child({ props })}
		<button
			{...props}
			class="button"
			aria-label={label}
			title={label}
			aria-pressed={pressed}
			data-pressed={pressed ? '' : undefined}
		>
			{@render children()}
		</button>
	{/snippet}
</Toolbar.Button>

<style>
	.button {
		display: inline-flex;
		gap: var(--gap-xs);
		align-items: center;
		justify-content: center;
		min-inline-size: var(--control-h-sm);
		block-size: var(--control-h-sm);
		padding-inline: var(--gap-xs);
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--hue-z0-muted);
		font: inherit;
		font-size: var(--type-body);
		line-height: var(--leading-ui);
		transition:
			background-color var(--motion-fast) var(--motion-ease),
			color var(--motion-fast) var(--motion-ease);
	}

	.button:hover:not(:disabled) {
		background-color: var(--hue-hover);
		color: var(--hue-z0-fg);
	}

	.button:active:not(:disabled) {
		background-color: var(--hue-pressed);
	}

	.button[data-pressed] {
		background-color: var(--hue-selected);
		color: var(--hue-z0-fg);
	}

	.button:disabled {
		opacity: 0.4;
	}
</style>
