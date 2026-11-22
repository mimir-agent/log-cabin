<script lang="ts">
	import { page } from '$app/state';
	import Badge from '#lib/components/shell/Badge.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import FormStatus from '#lib/components/settings/FormStatus.svelte';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import SettingsFrame from '#lib/components/settings/SettingsFrame.svelte';
	import SettingsRow from '#lib/components/settings/SettingsRow.svelte';
	import SettingsSection from '#lib/components/settings/SettingsSection.svelte';
	import Banner from '#lib/components/ui/Banner.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import StarterProjects from '#lib/components/invites/StarterProjects.svelte';
	import { orgTabs } from '#lib/settings-nav.js';
	import { auth } from '#lib/strings/auth.js';
	import { core } from '#lib/strings/core.js';
	import { invites } from '#lib/strings/invites.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = auth.invites;
	const bulk = invites.bulk;
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<SettingsFrame
	title={auth.orgSettings.title}
	avatar={{ name: data.orgName ?? '', src: data.orgLogoUrl, shape: 'square' }}
	tabs={orgTabs(page.url.pathname)}
>
	{#if form?.message}
		<Banner tone="danger">{form.message}</Banner>
	{/if}

	<form method="POST" action="?/email" enctype="multipart/form-data">
		<SettingsSection title={s.byEmail}>
			<div class="fields">
				<SettingsField label={bulk.emails} hint={bulk.emailsHint}>
					{#snippet children({ id, hintId })}
						<textarea {id} name="emails" rows="4" aria-describedby={hintId}></textarea>
					{/snippet}
				</SettingsField>
				<SettingsField label={bulk.file} hint={bulk.fileHint}>
					{#snippet children({ id, hintId })}
						<input
							{id}
							name="file"
							type="file"
							accept=".csv,.txt,text/csv,text/plain"
							aria-describedby={hintId}
						/>
					{/snippet}
				</SettingsField>
				<SettingsField label={s.role}>
					{#snippet children({ id })}
						<select {id} name="role" value="member">
							{#each data.roles as role (role)}
								<option value={role}>{core.roles[role]}</option>
							{/each}
						</select>
					{/snippet}
				</SettingsField>
				<StarterProjects projects={data.starterProjects} />
			</div>
			{#if form?.notSent?.length}
				<Banner tone="warning">{bulk.notSentTitle(form.notSent.length)}</Banner>
				<ul class="not-sent">
					{#each form.notSent as { email, reason }, i (i)}
						<li>{invites.notSentLine(email, invites.notSent[reason])}</li>
					{/each}
				</ul>
			{/if}
			{#snippet footer()}
				<FormStatus
					saved={form?.sent === undefined
						? undefined
						: form.sent
							? bulk.sent(form.sent)
							: bulk.noneSent}
				/>
				<Button type="submit" variant="primary">{bulk.send}</Button>
			{/snippet}
		</SettingsSection>
	</form>

	<form method="POST" action="?/link">
		<SettingsSection title={s.byLink} description={s.linkIntro}>
			{#if form?.link}
				<SettingsField label={s.linkLabel} hint={s.linkCreated}>
					{#snippet children({ id, hintId })}
						<input {id} class="link" readonly value={form?.link} aria-describedby={hintId} />
					{/snippet}
				</SettingsField>
			{/if}
			<div class="fields">
				<div class="row">
					<SettingsField label={s.role}>
						{#snippet children({ id })}
							<select {id} name="role" value="member">
								{#each data.roles as role (role)}
									<option value={role}>{core.roles[role]}</option>
								{/each}
							</select>
						{/snippet}
					</SettingsField>
					<SettingsField label={s.expiry}>
						{#snippet children({ id })}
							<select {id} name="days" value="7">
								{#each data.linkInviteDays as days (days)}
									<option value={String(days)}>{s.days(days)}</option>
								{/each}
							</select>
						{/snippet}
					</SettingsField>
				</div>
				<StarterProjects projects={data.starterProjects} />
			</div>
			{#snippet footer()}
				<Button type="submit" variant="primary">{s.createLink}</Button>
			{/snippet}
		</SettingsSection>
	</form>

	<SettingsSection title={s.open} flush>
		{#if data.invites.length === 0}
			<EmptyState title={s.none}>
				{#snippet icon()}<Icon name="user-circle-plus" size={32} />{/snippet}
			</EmptyState>
		{:else}
			{#each data.invites as invite (invite.id)}
				<form method="POST" action="?/revoke">
					<input type="hidden" name="id" value={invite.id} />
					<SettingsRow
						title={invite.email ?? s.linkLabel}
						description="{s.expires} {new Date(invite.expiresAt).toLocaleDateString(undefined, {
							timeZone: data.timeZone
						})}"
					>
						{#snippet meta()}<Badge>{core.roles[invite.role]}</Badge>{/snippet}
						{#snippet leading()}
							<Icon name={invite.email ? 'user-circle' : 'link'} />
						{/snippet}
						{#snippet trailing()}
							<Button type="submit" variant="flat" size="sm">
								<Icon name="trash" size={16} />
								{s.revoke}
							</Button>
						{/snippet}
					</SettingsRow>
				</form>
			{/each}
		{/if}
	</SettingsSection>
</SettingsFrame>

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-md);
	}

	.fields {
		display: grid;
		gap: 1.25rem;
	}

	textarea {
		resize: vertical;
	}

	.not-sent {
		margin: 0;
		padding-inline-start: var(--gap-lg);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: var(--leading-tight);
	}

	.link {
		font-family: var(--ff-mono);
	}
</style>
