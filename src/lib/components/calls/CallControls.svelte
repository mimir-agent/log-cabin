<!--
@component
A call's controls, after Campsite's ActiveCall (CC BY-NC 4.0): round 40px buttons, green while
your microphone or camera is on and grey while off, a chevron beside the microphone for the
devices, Leave in red, and the layout switch at the far end. On a phone Leave takes its own
full-width row above the rest.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import { calls } from '#lib/strings/calls.js';

	type Props = {
		layout: 'speaker' | 'grid';
		muted: boolean;
		cameraOff: boolean;
		sharing: boolean;
		canShare: boolean;
		showDevices: boolean;
		onmute: () => void;
		oncamera: () => void;
		onshare: () => void;
		onleave: () => void;
		onlayout: (layout: 'speaker' | 'grid') => void;
		ondevices: () => void;
		/** The device picker, shown above the controls while open. */
		devices: Snippet;
	};

	let { layout, muted, cameraOff, sharing, canShare, showDevices, ...on }: Props = $props();
	const s = calls.room;
	const d = calls.devices;
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && showDevices && on.ondevices()} />

<div class="controls" role="toolbar" aria-label={s.controls}>
	<div class="center">
		<span class="pair">
			<button
				type="button"
				class="control"
				data-on={muted ? undefined : ''}
				aria-pressed={muted}
				aria-label={s.mute}
				title={muted ? s.unmute : s.mute}
				onclick={on.onmute}
			>
				<Icon name={muted ? 'microphone-mute' : 'microphone'} size={24} />
			</button>
			<button
				type="button"
				class="more"
				aria-expanded={showDevices}
				aria-label={d.settings}
				title={d.settings}
				onclick={on.ondevices}
			>
				<Icon name="chevron-down" size={20} />
			</button>
		</span>
		<button
			type="button"
			class="control"
			data-on={cameraOff ? undefined : ''}
			aria-pressed={cameraOff}
			aria-label={s.cameraOff}
			title={cameraOff ? s.cameraOn : s.cameraOff}
			onclick={on.oncamera}
		>
			<Icon name={cameraOff ? 'video-camera-off' : 'video-camera'} size={24} />
		</button>
		{#if canShare}
			<button
				type="button"
				class="control"
				data-on={sharing ? '' : undefined}
				aria-pressed={sharing}
				aria-label={s.share}
				title={sharing ? s.stopShare : s.share}
				onclick={on.onshare}
			>
				<Icon name="monitor" size={24} />
			</button>
		{/if}
	</div>
	<button type="button" class="leave" onclick={on.onleave}>{s.leave}</button>
	<div class="end">
		<IconButton
			icon="grid"
			label={d.gridView}
			aria-pressed={layout === 'grid'}
			variant={layout === 'grid' ? 'flat' : 'plain'}
			quiet={layout !== 'grid'}
			onclick={() => on.onlayout('grid')}
		/>
		<IconButton
			icon="user"
			label={d.speakerView}
			aria-pressed={layout === 'speaker'}
			variant={layout === 'speaker' ? 'flat' : 'plain'}
			quiet={layout !== 'speaker'}
			onclick={() => on.onlayout('speaker')}
		/>
	</div>
	{#if showDevices}
		<div class="devices">{@render on.devices()}</div>
	{/if}
</div>

<style>
	.controls {
		position: relative;
		display: grid;
		grid-template-areas: 'start center leave end';
		grid-template-columns: 1fr auto auto 1fr;
		gap: var(--gap-lg) 0.75rem;
		align-items: center;
		padding: var(--gap-sm) var(--gap-sm) var(--gap-xs);
	}

	.center {
		display: flex;
		grid-area: center;
		gap: var(--gap-lg);
		align-items: center;
	}

	.pair {
		display: flex;
		align-items: center;
	}

	.control {
		display: grid;
		place-items: center;
		inline-size: var(--tap-min);
		block-size: var(--tap-min);
		padding: 0;
		border: 0;
		border-radius: var(--radius-full);
		background-color: var(--hue-z2-bg);
		box-shadow: var(--shadow-button);
		color: var(--hue-z0-fg);
		cursor: pointer;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	.control:hover {
		background-color: var(--hue-gray-700);
	}

	/* On is the call green: the one place the chrome takes a colour. */
	.control[data-on] {
		background-color: var(--hue-call-solid);
		box-shadow: none;
		color: var(--hue-gray-50);
	}

	.control[data-on]:hover {
		background-color: var(--hue-call-solid-hover);
	}

	.more {
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		background: none;
		color: var(--hue-text-quaternary);
		cursor: pointer;
	}

	.more:hover,
	.more[aria-expanded='true'] {
		color: var(--hue-z0-muted);
	}

	.leave {
		grid-area: leave;
		block-size: var(--tap-min);
		padding-inline: var(--gap-lg);
		border: 0;
		border-radius: var(--radius-surface);
		background-color: var(--hue-danger-solid);
		color: var(--hue-white);
		font: inherit;
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		cursor: pointer;
	}

	.leave:hover {
		background-color: var(--hue-red-600);
	}

	.end {
		display: flex;
		grid-area: end;
		gap: 0.125rem;
		justify-self: end;
	}

	/* Campsite's device popover: 300px, raised, on the controls' dark. */
	.devices {
		position: absolute;
		inset-block-end: calc(100% + var(--gap-sm));
		inset-inline-start: 50%;
		inline-size: min(18.75rem, calc(100vw - 2 * var(--gap-lg)));
		padding: 0.75rem;
		border-radius: var(--radius-surface);
		background-color: var(--hue-z2-bg);
		box-shadow: var(--elevation-popover);
		translate: -50% 0;
	}

	@media (max-width: 39.99rem) {
		.controls {
			grid-template-areas: 'leave leave' 'center end';
			grid-template-columns: 1fr auto;
		}

		.leave {
			inline-size: 100%;
		}
	}
</style>
