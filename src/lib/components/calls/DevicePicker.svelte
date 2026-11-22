<script lang="ts">
	import { browser } from '$app/env';
	import Switch from '#lib/components/ui/Switch.svelte';
	import { canPickSpeaker, type DeviceKind } from '#lib/calls/devices.js';
	import type { LocalMedia } from '#lib/calls/local-media.svelte.js';
	import { calls as strings } from '#lib/strings/calls.js';

	let { media, onerror }: { media: LocalMedia; onerror: (e: unknown) => void } = $props();
	const s = strings.devices;
	// Whether a speaker can be chosen is a question for the browser, never the server.
	const kinds: DeviceKind[] =
		browser && canPickSpeaker()
			? ['audioinput', 'videoinput', 'audiooutput']
			: ['audioinput', 'videoinput'];

	/** The device in use: the one chosen, or the browser's default (listed first). */
	const selected = (kind: DeviceKind) => media.deviceId(kind) ?? media.devices[kind][0]?.deviceId;
</script>

<!-- Campsite's device picker: each device a 12px label over a 32px select, 20px apart. -->
<fieldset class="devices">
	<legend class="u:visually-hidden">{s.legend}</legend>
	{#each kinds as kind (kind)}
		<label class="device">
			<span>{s.kinds[kind]}</span>
			<select onchange={(e) => media.useDevice(kind, e.currentTarget.value).catch(onerror)}>
				{#each media.devices[kind] as device, i (device.deviceId)}
					<option value={device.deviceId} selected={device.deviceId === selected(kind)}>
						{device.label || s.unnamed(kind, i + 1)}
					</option>
				{/each}
			</select>
		</label>
	{/each}
	<Switch
		label={s.noiseCancellation}
		checked={media.prefs.noiseCancellation}
		onCheckedChange={(on) => media.setNoiseCancellation(on).catch(onerror)}
	/>
</fieldset>

<style>
	.devices {
		display: grid;
		gap: 1.25rem;
		min-inline-size: 0;
		margin: 0;
		padding: 0;
		border: 0;
		text-align: start;
	}

	.device {
		display: grid;
		gap: 0.375rem;
	}

	.device span {
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
	}

	select {
		inline-size: 100%;
		block-size: 2rem;
		padding-inline: 0.5rem;
		border: 0;
		border-radius: var(--radius-control);
		background-color: var(--hue-z2-bg);
		box-shadow: var(--shadow-button);
		color: var(--hue-z0-fg);
		font: inherit;
		font-size: var(--type-control);
	}
</style>
