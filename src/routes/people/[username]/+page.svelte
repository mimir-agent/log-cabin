<script lang="ts">
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Badge from '#lib/components/shell/Badge.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import ProfileHeader from '#lib/components/people/ProfileHeader.svelte';
	import StatusPicker from '#lib/components/people/StatusPicker.svelte';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import SettingsSection from '#lib/components/settings/SettingsSection.svelte';
	import Banner from '#lib/components/ui/Banner.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import MessageButton from '#lib/components/chat/MessageButton.svelte';
	import { auth } from '#lib/strings/auth.js';
	import { calls } from '#lib/strings/calls.js';
	import { core } from '#lib/strings/core.js';
	import { people } from '#lib/strings/people.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = auth.profile;
	let picking = $state(false);
	const joined = $derived(
		new Date(data.member.createdAt).toLocaleDateString(undefined, { timeZone: data.timeZone })
	);
</script>

<svelte:head>
	<title>{data.member.name} · {core.appName}</title>
</svelte:head>

<PageHeader title={data.member.name}>
	{#snippet leading()}<Avatar name={data.member.name} src={data.person.avatarUrl} />{/snippet}
	{#snippet description()}
		{people.username.at(data.member.username)} · {core.roles[data.member.role]}
		{#if data.member.deactivatedAt}<Badge>{auth.members.deactivated}</Badge>{/if}
	{/snippet}
	{#snippet actions()}
		{#if data.canMessage}<MessageButton userId={data.person.userId} />{/if}
		{#if data.roomPath}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the calls module builds room paths -->
			<Button href={data.roomPath} variant="primary">{calls.personalRoom.call}</Button>
		{/if}
	{/snippet}
</PageHeader>

<div class="page">
	{#if data.member.deactivatedAt}
		<Banner>{s.deactivatedNote}</Banner>
	{/if}

	<ProfileHeader person={data.person}>
		{#snippet statusAction()}
			{#if data.isSelf}
				<Button variant="ghost" size="sm" onclick={() => (picking = true)}>
					{data.person.status ? people.status.edit : people.status.set}
				</Button>
				<StatusPicker
					username={data.person.username}
					status={data.person.status}
					bind:open={picking}
				/>
			{/if}
		{/snippet}
		<dl class="facts">
			<div>
				<dt>{s.email}</dt>
				<dd>{data.member.email}</dd>
			</div>
			<div>
				<dt>{s.joined}</dt>
				<dd><time datetime={new Date(data.member.createdAt).toISOString()}>{joined}</time></dd>
			</div>
		</dl>
	</ProfileHeader>

	{#if data.canManage}
		{#if form?.message}
			<Banner tone="danger">{form.message}</Banner>
		{/if}
		<form method="POST" action="?/role">
			<SettingsSection title={s.changeRole}>
				<SettingsField label={auth.invites.role}>
					{#snippet children({ id })}
						<select {id} name="role" value={data.member.role}>
							{#each data.roles as role (role)}
								<option value={role}>{core.roles[role]}</option>
							{/each}
						</select>
					{/snippet}
				</SettingsField>
				{#snippet footer()}
					<Button type="submit" variant="primary">{s.saveRole}</Button>
				{/snippet}
			</SettingsSection>
		</form>

		<form method="POST" action={data.member.deactivatedAt ? '?/reactivate' : '?/deactivate'}>
			<SettingsSection title={data.member.deactivatedAt ? s.reactivate : s.deactivate}>
				{#snippet actions()}
					<Button type="submit" variant={data.member.deactivatedAt ? 'secondary' : 'danger'}>
						{data.member.deactivatedAt ? s.reactivate : s.deactivate}
					</Button>
				{/snippet}
			</SettingsSection>
		</form>
	{/if}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--gap-2xl);
		inline-size: 100%;
		max-inline-size: 48rem;
		margin-inline: auto;
		padding: var(--gap-2xl) var(--gap-lg) 8rem;
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs) var(--gap-lg);
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
	}

	.facts > div {
		display: flex;
		gap: var(--gap-xs);
	}

	dd {
		margin: 0;
		color: var(--hue-text-secondary);
	}
</style>
