<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ImagePicker from '#lib/components/settings/ImagePicker.svelte';
	import FormStatus from '#lib/components/settings/FormStatus.svelte';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import SettingsFrame from '#lib/components/settings/SettingsFrame.svelte';
	import SettingsSection from '#lib/components/settings/SettingsSection.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import SegmentedControl from '#lib/components/ui/SegmentedControl.svelte';
	import { accountTabs } from '#lib/settings-nav.js';
	import { applyTheme, themeChoices, type ThemeChoice } from '#lib/styles/theme.js';
	import { auth } from '#lib/strings/auth.js';
	import { calls } from '#lib/strings/calls.js';
	import { toast } from '#lib/components/ui/Toast.svelte';
	import { core } from '#lib/strings/core.js';
	import { people } from '#lib/strings/people.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = auth.ownProfile;
	const e = auth.emailChange;
	let editing = $state(false);

	async function copyRoomLink() {
		await navigator.clipboard.writeText(page.url.origin + data.roomPath);
		toast(calls.personalLink.copied);
	}
	let theme = $state(untrack(() => data.theme));
	let themeSaved = $state(false);
	let themeError = $state<string>();

	// Saves as soon as it changes, and switches this page at once.
	async function saveTheme(choice: ThemeChoice) {
		applyTheme(choice);
		const body = new FormData();
		body.set('theme', choice);
		const response = await fetch(resolve('/settings/profile/theme'), { method: 'POST', body });
		themeSaved = response.ok;
		themeError = response.ok ? undefined : people.theme.errors.saveFailed;
	}
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<SettingsFrame
	title={s.title}
	avatar={{ name: data.profile.name, src: data.profile.avatarUrl }}
	tabs={accountTabs(page.url.pathname, data.calcomTab)}
>
	<form method="POST" action="?/saveProfile" enctype="multipart/form-data">
		<SettingsSection title={data.profile.name}>
			<div class="cover">
				<ImagePicker
					name={data.profile.name}
					src={data.profile.coverUrl}
					shape="cover"
					inputName="cover"
					label={people.cover.label}
				/>
			</div>
			<div class="profile">
				<ImagePicker
					name={data.profile.name}
					src={data.profile.avatarUrl}
					inputName="avatar"
					label={s.avatar}
				/>
				<div class="fields">
					<SettingsField label={s.name}>
						{#snippet children({ id, hintId })}
							<input
								{id}
								name="name"
								required
								autocomplete="name"
								value={data.profile.name}
								aria-describedby={hintId}
							/>
						{/snippet}
					</SettingsField>
					<SettingsField label={people.username.label} hint={people.username.hint}>
						{#snippet children({ id, hintId })}
							<input
								{id}
								name="username"
								required
								autocomplete="username"
								autocapitalize="none"
								spellcheck="false"
								pattern={'[A-Za-z0-9_\\-]{2,32}'}
								maxlength="32"
								value={data.profile.username}
								aria-describedby={hintId}
							/>
						{/snippet}
					</SettingsField>
				</div>
			</div>
			{#snippet footer()}
				<FormStatus message={form?.message} saved={form?.saved ? s.saved : undefined} />
				<Button type="submit" variant="primary">{s.save}</Button>
			{/snippet}
		</SettingsSection>
	</form>

	<SettingsSection
		title={e.heading}
		description={data.pendingEmail ? e.pending(data.pendingEmail) : data.profile.email}
		footer={editing || data.pendingEmail || form?.emailMessage || form?.emailSent
			? emailFooter
			: undefined}
	>
		{#snippet actions()}
			{#if !editing}
				<Button type="button" onclick={() => (editing = true)}>{e.change}</Button>
			{/if}
		{/snippet}
		{#if editing}
			<form id="change-email" method="POST" action="?/changeEmail">
				<SettingsField label={e.newEmail}>
					{#snippet children({ id })}
						<input {id} name="email" type="email" required autocomplete="email" />
					{/snippet}
				</SettingsField>
			</form>
		{/if}
	</SettingsSection>

	<SettingsSection
		title={people.theme.label}
		footer={themeSaved || themeError ? themeStatus : undefined}
	>
		{#snippet actions()}
			<SegmentedControl
				bind:value={theme}
				label={people.theme.label}
				options={themeChoices.map((value) => ({ value, label: people.theme.choices[value] }))}
				onValueChange={saveTheme}
			/>
		{/snippet}
	</SettingsSection>

	<SettingsSection title={calls.personalLink.title} description={calls.personalLink.intro}>
		{#snippet actions()}
			<Button onclick={copyRoomLink}>{calls.personalLink.copy}</Button>
		{/snippet}
	</SettingsSection>

	<form class="sign-out" method="POST" action="/logout" data-sveltekit-reload>
		<Button type="submit">{auth.signOut}</Button>
	</form>
</SettingsFrame>

{#snippet emailFooter()}
	<FormStatus
		message={form?.emailMessage}
		saved={form?.emailSent ? e.sent(form.emailSent, data.profile.email) : undefined}
	/>
	{#if editing}
		<Button type="button" onclick={() => (editing = false)}>{e.cancel}</Button>
		<Button type="submit" form="change-email" variant="primary">{e.send}</Button>
	{:else if data.pendingEmail}
		<form method="POST" action="?/changeEmail">
			<input type="hidden" name="email" value={data.pendingEmail} />
			<Button type="submit">{e.resend}</Button>
		</form>
	{/if}
{/snippet}

{#snippet themeStatus()}
	<FormStatus message={themeError} saved={themeSaved ? people.theme.saved : undefined} />
{/snippet}

<style>
	/* Campsite's profile block: the picture beside the fields, stacked on a phone. */
	.profile {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: var(--gap-sm) var(--gap-xs) var(--gap-md);
	}

	.cover {
		display: flex;
		flex-direction: column;
		padding: var(--gap-sm) var(--gap-xs) 0;
	}

	.fields {
		display: grid;
		flex: 1;
		gap: 1.25rem;
		min-inline-size: 0;
	}

	.sign-out {
		display: flex;
	}

	@media (min-width: 40rem) {
		.profile {
			flex-direction: row;
			gap: var(--gap-xl);
			padding-inline-start: var(--gap-md);
		}
	}
</style>
