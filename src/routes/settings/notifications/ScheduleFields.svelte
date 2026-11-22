<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/UserSettings/NotificationSchedule.tsx and apps/web/components/NotificationSchedule/, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
The notification schedule's fields, inside the settings form: at all times, or on the chosen
days between two times, in 30-minute steps. Campsite's new schedule is weekdays 08:00 to 18:00.
-->
<script lang="ts">
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import SegmentedControl from '#lib/components/ui/SegmentedControl.svelte';
	import { notifications } from '#lib/strings/notifications.js';

	type Schedule = { weekdays: number[]; startMinute: number; endMinute: number };
	let { schedule }: { schedule: Schedule | null } = $props();
	const s = notifications.settings;

	let mode = $derived<'always' | 'custom'>(schedule ? 'custom' : 'always');
	const shown = $derived(
		schedule ?? { weekdays: [1, 2, 3, 4, 5], startMinute: 8 * 60, endMinute: 18 * 60 }
	);
	const steps = Array.from({ length: 48 }, (_, i) => i * 30);
	const clock = (minute: number) =>
		`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
</script>

<input type="hidden" name="schedule" value={mode} />
<SegmentedControl
	bind:value={mode}
	label={s.scheduleLabel}
	options={[
		{ value: 'always', label: s.scheduleModes.always },
		{ value: 'custom', label: s.scheduleModes.custom }
	]}
/>
<div class="custom" hidden={mode !== 'custom'}>
	<fieldset>
		<legend>{s.days}</legend>
		<div class="days">
			{#each s.weekdaysShort as day, index (day)}
				<label class="day">
					<input
						type="checkbox"
						name="weekday"
						value={index}
						checked={shown.weekdays.includes(index)}
					/>
					{day}
				</label>
			{/each}
		</div>
	</fieldset>
	<div class="times">
		<SettingsField label={s.from}>
			{#snippet children({ id })}
				<select {id} name="startMinute" value={String(shown.startMinute)}>
					{#each steps as minute (minute)}
						<option value={String(minute)}>{clock(minute)}</option>
					{/each}
				</select>
			{/snippet}
		</SettingsField>
		<SettingsField label={s.to}>
			{#snippet children({ id })}
				<select {id} name="endMinute" value={String(shown.endMinute)}>
					{#each steps as minute (minute)}
						<option value={String(minute)}>{clock(minute)}</option>
					{/each}
				</select>
			{/snippet}
		</SettingsField>
	</div>
</div>

<style>
	.custom {
		display: grid;
		gap: var(--gap-md);
		margin-block-start: var(--gap-md);
	}

	.custom[hidden] {
		display: none;
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-block-end: 0.375rem;
		padding: 0;
		color: var(--hue-text-secondary);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
	}

	.days,
	.times {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-md);
	}

	.day {
		display: flex;
		gap: var(--gap-xs);
		align-items: center;
		font-size: var(--type-body);
	}

	.day input {
		inline-size: 1rem;
		block-size: 1rem;
		margin: 0;
		accent-color: var(--hue-accent);
	}
</style>
