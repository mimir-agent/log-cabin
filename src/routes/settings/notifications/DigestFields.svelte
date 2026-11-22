<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/UserSettings/Notifications/WeeklySummary.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
The two digests' fields, inside the settings form: each on or off, its hour, and the weekly
one's day.
-->
<script lang="ts">
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import Switch from '#lib/components/ui/Switch.svelte';
	import { notifications } from '#lib/strings/notifications.js';

	type Digests = {
		dailyDigest: boolean;
		dailyDigestHour: number;
		weeklyDigest: boolean;
		weeklyDigestWeekday: number;
		weeklyDigestHour: number;
	};
	let { settings }: { settings: Digests } = $props();
	const s = notifications.settings;
	let daily = $derived(settings.dailyDigest);
	let weekly = $derived(settings.weeklyDigest);
	const hours = Array.from({ length: 24 }, (_, hour) => hour);
	const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
</script>

<div class="digest">
	<Switch
		bind:checked={daily}
		name="dailyDigest"
		label={s.dailyDigest}
		description={s.dailyDigestDescription}
	/>
	<div class="when" hidden={!daily}>
		<SettingsField label={s.hour}>
			{#snippet children({ id })}
				<select {id} name="dailyDigestHour" value={String(settings.dailyDigestHour)}>
					{#each hours as hour (hour)}
						<option value={String(hour)}>{hourLabel(hour)}</option>
					{/each}
				</select>
			{/snippet}
		</SettingsField>
	</div>
</div>
<div class="digest">
	<Switch
		bind:checked={weekly}
		name="weeklyDigest"
		label={s.weeklyDigest}
		description={s.weeklyDigestDescription}
	/>
	<div class="when" hidden={!weekly}>
		<SettingsField label={s.weekday}>
			{#snippet children({ id })}
				<select {id} name="weeklyDigestWeekday" value={String(settings.weeklyDigestWeekday)}>
					{#each s.weekdays as day, index (day)}
						<option value={String(index)}>{day}</option>
					{/each}
				</select>
			{/snippet}
		</SettingsField>
		<SettingsField label={s.hour}>
			{#snippet children({ id })}
				<select {id} name="weeklyDigestHour" value={String(settings.weeklyDigestHour)}>
					{#each hours as hour (hour)}
						<option value={String(hour)}>{hourLabel(hour)}</option>
					{/each}
				</select>
			{/snippet}
		</SettingsField>
	</div>
</div>

<style>
	.digest {
		display: grid;
		gap: var(--gap-sm);
		margin-block-end: var(--gap-lg);
	}

	.when {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-md);
	}

	.when[hidden] {
		display: none;
	}
</style>
