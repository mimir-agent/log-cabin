<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import FormStatus from '#lib/components/settings/FormStatus.svelte';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import SettingsFrame from '#lib/components/settings/SettingsFrame.svelte';
	import SettingsSection from '#lib/components/settings/SettingsSection.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { accountTabs } from '#lib/settings-nav.js';
	import { calcom } from '#lib/strings/calcom.js';
	import { core } from '#lib/strings/core.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = calcom.settings;
	const disconnectId = $props.id();
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<SettingsFrame
	title={s.title}
	avatar={{ name: data.user?.name ?? '', src: data.user?.avatarUrl }}
	tabs={accountTabs(page.url.pathname, data.calcomTab)}
>
	{#if !data.available}
		<SettingsSection title={s.title} description={s.unavailable[data.missing]} />
	{:else}
		<form method="POST" action="?/save" use:enhance>
			<SettingsSection title={s.title} description={s.intro}>
				<SettingsField label={s.place} hint={s.placeHint}>
					{#snippet children({ id, hintId })}
						<select {id} name="place" required aria-describedby={hintId}>
							<option value="room" selected={!data.connection?.projectId}>{s.personalRoom}</option>
							{#each data.projects as project (project.id)}
								<option value={project.id} selected={project.id === data.connection?.projectId}>
									{project.name}
								</option>
							{/each}
						</select>
					{/snippet}
				</SettingsField>
				<SettingsField label={s.apiKey} hint={data.connection ? s.apiKeyKept : s.apiKeyHint}>
					{#snippet children({ id, hintId })}
						<input
							{id}
							name="apiKey"
							type="password"
							autocomplete="off"
							required={!data.connection}
							aria-describedby={hintId}
						/>
					{/snippet}
				</SettingsField>
				{#snippet footer()}
					<FormStatus
						message={form?.message}
						saved={form?.saved ? s.saved : form?.disconnected ? s.disconnected : undefined}
					/>
					{#if data.connection}
						<Button type="submit" form={disconnectId}>{s.disconnect}</Button>
					{/if}
					<Button type="submit" variant="primary">{data.connection ? s.save : s.connect}</Button>
				{/snippet}
			</SettingsSection>
		</form>

		{#if data.connection}
			<form id={disconnectId} method="POST" action="?/disconnect" use:enhance></form>
			<SettingsSection title={s.webhookTitle} description={s.webhookSteps}>
				<SettingsField label={s.webhookUrl}>
					{#snippet children({ id })}
						<input {id} readonly value={data.connection?.webhookUrl} />
					{/snippet}
				</SettingsField>
				<SettingsField label={s.webhookSecret}>
					{#snippet children({ id })}
						<input {id} readonly value={data.connection?.webhookSecret} />
					{/snippet}
				</SettingsField>
			</SettingsSection>
		{/if}
	{/if}
</SettingsFrame>
