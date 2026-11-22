<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/hooks/usePauseNotificationMenuItem.ts, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
Pausing notifications: Campsite's quick choices, or a time of your own, and Resume while paused.
-->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { DropdownMenu } from 'bits-ui';
	import FormStatus from '#lib/components/settings/FormStatus.svelte';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import SettingsSection from '#lib/components/settings/SettingsSection.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import { pauseEnd, pausePresets } from '#lib/notification-pause.js';
	import { notifications } from '#lib/strings/notifications.js';
	import { time } from '#lib/strings/time.js';

	let { pausedUntil }: { pausedUntil: number | null } = $props();
	const s = notifications.settings;
	let custom = $state('');
	let failure = $state<string | undefined>();

	async function send(method: 'POST' | 'DELETE', until?: number) {
		failure = undefined;
		const response = await fetch('/settings/notifications/pause', {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ until })
		});
		if (!response.ok) failure = ((await response.json()) as { message: string }).message;
		await invalidateAll();
	}
</script>

<SettingsSection title={s.pauseHeading} description={s.pauseIntro}>
	<p class="status" role="status">
		{pausedUntil ? s.pausedUntil(time.long(pausedUntil, page.data.timeZone)) : s.notPaused}
	</p>
	<form
		class="until"
		onsubmit={(event) => {
			event.preventDefault();
			send('POST', new Date(custom).getTime());
		}}
	>
		<SettingsField label={s.pauseUntil}>
			{#snippet children({ id })}
				<input {id} type="datetime-local" bind:value={custom} required />
			{/snippet}
		</SettingsField>
		<Button type="submit">{s.pauseUntilSubmit}</Button>
	</form>
	{#snippet footer()}
		<FormStatus message={failure} />
		{#if pausedUntil}
			<Button onclick={() => send('DELETE')}>{s.resume}</Button>
		{/if}
		<Menu align="end">
			{#snippet trigger({ props })}
				<Button {...props} variant="primary">{s.pauseMenu}</Button>
			{/snippet}
			{#each pausePresets as preset (preset)}
				<DropdownMenu.Item onSelect={() => send('POST', pauseEnd(preset, new Date()))}>
					{s.pausePresets[preset]}
				</DropdownMenu.Item>
			{/each}
		</Menu>
	{/snippet}
</SettingsSection>

<style>
	.status {
		margin: 0 0 var(--gap-md);
		font-size: var(--type-body);
	}

	.until {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-md);
		align-items: end;
	}
</style>
