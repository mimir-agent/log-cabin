<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import FormStatus from '#lib/components/settings/FormStatus.svelte';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import SettingsFrame from '#lib/components/settings/SettingsFrame.svelte';
	import SettingsRow from '#lib/components/settings/SettingsRow.svelte';
	import SettingsSection from '#lib/components/settings/SettingsSection.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import { orgTabs } from '#lib/settings-nav.js';
	import { auth } from '#lib/strings/auth.js';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();
	const s = posts.emoji;
	const fieldError = (field: string) => (form?.field === field ? form.message : undefined);
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<!-- One of the org's settings tabs for admins; members who may add emoji get the page alone. -->
<SettingsFrame
	title={auth.orgSettings.title}
	avatar={{ name: data.orgName, src: data.orgLogoUrl, shape: 'square' }}
	tabs={data.isAdmin ? orgTabs(page.url.pathname) : []}
>
	{#if data.isAdmin}
		<form method="POST" action="?/whoMayAdd" use:enhance>
			<SettingsSection title={s.whoMayAdd}>
				<SettingsField label={s.whoMayAdd}>
					{#snippet children({ id })}
						<select {id} name="customEmojiBy" value={data.customEmojiBy}>
							<option value="members">{s.whoMayAddOptions.members}</option>
							<option value="admins">{s.whoMayAddOptions.admins}</option>
						</select>
					{/snippet}
				</SettingsField>
				{#snippet footer()}
					<FormStatus message={form?.field ? undefined : form?.message} />
					<Button type="submit" variant="primary">{posts.composer.save}</Button>
				{/snippet}
			</SettingsSection>
		</form>
	{/if}

	{#if data.canAdd}
		<form method="POST" action="?/add" enctype="multipart/form-data" use:enhance>
			<SettingsSection title={s.add} description={s.intro(data.orgName)}>
				<div class="fields">
					<SettingsField label={s.nameLabel} hint={s.nameHint} error={fieldError('name')}>
						{#snippet children({ id, hintId })}
							<input
								{id}
								name="name"
								required
								value={form?.name ?? ''}
								autocomplete="off"
								aria-describedby={hintId}
							/>
						{/snippet}
					</SettingsField>
					<SettingsField label={s.fileLabel} hint={s.fileHint} error={fieldError('file')}>
						{#snippet children({ id, hintId })}
							<input
								{id}
								name="file"
								type="file"
								required
								accept="image/png,image/gif,image/webp"
								aria-describedby={hintId}
							/>
						{/snippet}
					</SettingsField>
				</div>
				{#snippet footer()}
					<Button type="submit" variant="primary">{s.submit}</Button>
				{/snippet}
			</SettingsSection>
		</form>
	{/if}

	<SettingsSection
		title={s.title}
		description={data.canAdd ? undefined : `${s.intro(data.orgName)} ${s.readOnly}`}
		flush
	>
		{#if data.emoji.length === 0}
			<EmptyState title={s.empty}>
				{#snippet icon()}<Icon name="face-smile" size={32} />{/snippet}
			</EmptyState>
		{:else}
			{#each data.emoji as emoji (emoji.id)}
				<SettingsRow title=":{emoji.name}:" description={s.addedBy(emoji.createdByName)}>
					{#snippet leading()}<img class="emoji" src={emoji.url} alt="" />{/snippet}
					{#snippet trailing()}
						{#if data.isAdmin || emoji.createdBy === data.viewerId}
							<form method="POST" action="?/remove" use:enhance>
								<input type="hidden" name="id" value={emoji.id} />
								<IconButton type="submit" icon="trash" label={s.remove(emoji.name)} quiet />
							</form>
						{/if}
					{/snippet}
				</SettingsRow>
			{/each}
		{/if}
	</SettingsSection>
</SettingsFrame>

<style>
	.fields {
		display: grid;
		gap: 1.25rem;
	}

	.emoji {
		display: block;
		inline-size: var(--gap-2xl);
		block-size: var(--gap-2xl);
		object-fit: contain;
	}
</style>
