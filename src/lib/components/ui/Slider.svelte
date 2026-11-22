<!--
@component
A value picked by dragging along a track, or with the arrow keys: the crop dialog's zoom. Built
on bits-ui's Slider, in the switch's colours: the filled part is the switch's "on" blue, the
rest its "off" grey, and the thumb is white.
-->
<script lang="ts">
	import { Slider } from 'bits-ui';

	type Props = {
		value?: number;
		min: number;
		max: number;
		step: number;
		/** Names the thumb for screen readers. */
		label: string;
	};

	let { value = $bindable(0), min, max, step, label }: Props = $props();
</script>

<Slider.Root type="single" bind:value {min} {max} {step}>
	{#snippet child({ props })}
		<span {...props} class="slider">
			<span class="track">
				<Slider.Range>
					{#snippet child({ props })}<span {...props} class="range"></span>{/snippet}
				</Slider.Range>
			</span>
			<Slider.Thumb index={0}>
				{#snippet child({ props })}
					<span {...props} class="thumb" aria-label={label}></span>
				{/snippet}
			</Slider.Thumb>
		</span>
	{/snippet}
</Slider.Root>

<style>
	.slider {
		position: relative;
		display: flex;
		align-items: center;
		inline-size: 100%;
		block-size: var(--control-h-sm);
		touch-action: none;
		cursor: pointer;
	}

	.track {
		position: relative;
		flex: 1;
		block-size: 0.25rem;
		overflow: hidden;
		border-radius: var(--radius-full);
		background-color: var(--hue-switch-off);
	}

	.range {
		position: absolute;
		block-size: 100%;
		background-color: var(--hue-switch-on);
	}

	.thumb {
		display: block;
		inline-size: 1rem;
		block-size: 1rem;
		border-radius: var(--radius-full);
		background-color: var(--hue-white);
		box-shadow: var(--shadow-button);
	}

	.thumb:focus-visible {
		outline: var(--focus-ring-width) solid var(--hue-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}
</style>
