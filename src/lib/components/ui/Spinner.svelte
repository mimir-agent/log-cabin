<script lang="ts">
	type Props = {
		/** What is happening, read out instead of the spinner: "Transcribing", "Loading preview". */
		label: string;
		/** Show the label next to it, in the muted colour. Off for a spinner inside a button. */
		showLabel?: boolean;
	};

	let { label, showLabel = false }: Props = $props();
</script>

<span class="spinner" role="status">
	<span class="ring" aria-hidden="true"></span>
	<span class={showLabel ? 'label' : 'u:visually-hidden'}>{label}</span>
</span>

<style>
	.spinner {
		display: inline-flex;
		gap: var(--gap-sm);
		align-items: center;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: var(--leading-tight);
	}

	/* A quarter arc on a faint track, sized to the text around it. */
	.ring {
		flex: none;
		inline-size: 1em;
		block-size: 1em;
		border: 0.125em solid color-mix(in oklch, currentColor 20%, transparent);
		border-block-start-color: currentColor;
		border-radius: var(--radius-full);
		animation: turn 0.8s linear infinite;
	}

	@keyframes turn {
		to {
			rotate: 1turn;
		}
	}

	/* Reduced motion: no spin, the arc stays still and the label carries the meaning. */
	@media (prefers-reduced-motion: reduce) {
		.ring {
			animation: none;
		}
	}
</style>
