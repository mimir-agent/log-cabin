<script lang="ts">
	import ImagePicker from '#lib/components/settings/ImagePicker.svelte';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import DomainSetting from '#lib/components/invites/DomainSetting.svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Banner from '#lib/components/ui/Banner.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import Switch from '#lib/components/ui/Switch.svelte';
	import { auth } from '#lib/strings/auth.js';
	import { core } from '#lib/strings/core.js';
	import { invites } from '#lib/strings/invites.js';
	import { onboarding as s } from '#lib/strings/onboarding.js';
	import { people } from '#lib/strings/people.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const step = $derived(s.steps[data.step]);
	// The server's answer to Continue: an error under one field, or what an invite skipped.
	const error = (field: string) =>
		form && 'field' in form && form.field === field ? form.message : undefined;
	const invalid = (field: string) => (error(field) ? 'true' : undefined);
	// After a refusal the fields keep what was typed, not what was saved before.
	const typed = (field: string, saved: string) => form?.typed?.[field] ?? saved;
	const domainModes = ['off', 'direct', 'request'] as const;
	const mode = $derived(
		domainModes.find((m) => m === typed('domainJoin', '')) ?? data.org.domainJoin
	);

	// Continue always submits; when the server refuses a field, focus lands on it.
	let stepForm: HTMLFormElement | undefined = $state();
	$effect(() => {
		if (form && 'field' in form)
			stepForm?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
	});
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<!-- Full screen, without the sidebar: the org's logo, the step in the middle, and how far along. -->
<div class="onboarding">
	<header>
		<Avatar name={data.org.name} src={data.org.logoUrl} shape="square" size="md" />
		<span class="position">{s.position(data.position, data.count)}</span>
	</header>

	{#key data.step}
		<form
			bind:this={stepForm}
			class="step"
			data-direction={data.backwards ? 'back' : 'forward'}
			method="POST"
			action="?/continue"
			enctype="multipart/form-data"
			novalidate
		>
			<hgroup>
				<h1 class="u:type-title">{step.title}</h1>
				<p>{step.description}</p>
			</hgroup>

			{#if data.step === 'org'}
				<ImagePicker
					name={data.org.name}
					src={data.org.logoUrl}
					shape="square"
					inputName="logo"
					label={auth.orgSettings.logo}
					error={error('logo')}
				/>
				<DomainSetting domain={typed('domain', data.org.domain)} {mode} error={error('domain')} />
			{:else if data.step === 'profile' && data.profile}
				<ImagePicker
					name={data.profile.name}
					src={data.profile.avatarUrl}
					inputName="avatar"
					label={auth.ownProfile.avatar}
					error={error('avatar')}
				/>
				<SettingsField label={auth.ownProfile.name} error={error('name')}>
					{#snippet children({ id, hintId })}
						<input
							{id}
							name="name"
							required
							autocomplete="name"
							value={typed('name', data.profile?.name ?? '')}
							aria-describedby={hintId}
							aria-invalid={invalid('name')}
						/>
					{/snippet}
				</SettingsField>
				<SettingsField
					label={people.username.label}
					hint={people.username.hint}
					error={error('username')}
				>
					{#snippet children({ id, hintId })}
						<input
							{id}
							name="username"
							required
							autocapitalize="none"
							spellcheck="false"
							maxlength="32"
							value={typed('username', data.profile?.username ?? '')}
							aria-describedby={hintId}
							aria-invalid={invalid('username')}
						/>
					{/snippet}
				</SettingsField>
			{:else if data.step === 'projects'}
				{#each data.projects as project (project.id)}
					<Switch
						name="project"
						value={project.id}
						label={project.name}
						description={project.description || undefined}
						checked={project.isMember}
					/>
				{:else}
					<p class="muted">{s.steps.projects.none}</p>
				{/each}
			{:else if data.step === 'invite'}
				{#if form?.report}
					<Banner tone="warning">
						{s.invited(form.report.sent)}
						{invites.bulk.notSentTitle(form.report.notSent.length)}
					</Banner>
					<ul class="muted">
						{#each form.report.notSent as { email, reason }, i (i)}
							<li>{invites.notSentLine(email, invites.notSent[reason])}</li>
						{/each}
					</ul>
				{/if}
				<SettingsField
					label={invites.bulk.emails}
					hint={invites.bulk.emailsHint}
					error={error('emails')}
				>
					{#snippet children({ id, hintId })}
						<textarea
							{id}
							name="emails"
							rows="4"
							value={typed('emails', '')}
							aria-describedby={hintId}
							aria-invalid={invalid('emails')}
						></textarea>
					{/snippet}
				</SettingsField>
				<SettingsField label={auth.invites.role}>
					{#snippet children({ id })}
						<select {id} name="role" value="member">
							{#each data.roles as role (role)}
								<option value={role}>{core.roles[role]}</option>
							{/each}
						</select>
					{/snippet}
				</SettingsField>
			{/if}

			<footer>
				{#if data.position > 1}
					<Button type="submit" variant="ghost" formaction="?/back" formnovalidate>
						{s.actions.back}
					</Button>
				{/if}
				<span class="end">
					<Button type="submit" variant="ghost" formaction="?/skip" formnovalidate>
						{s.actions.skip}
					</Button>
					<SuedeButton type="submit">
						{data.last ? s.actions.finish(data.org.name) : s.actions.continue}
					</SuedeButton>
				</span>
			</footer>
		</form>
	{/key}
</div>

<style>
	.onboarding {
		display: grid;
		grid-template-rows: auto 1fr;
		min-block-size: 100dvh;
		padding: var(--gap-lg) var(--gap-xl);
		background: var(--hue-z0-bg);
		color: var(--hue-z0-fg);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.position {
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-variant-numeric: tabular-nums;
	}

	.step {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xl);
		inline-size: min(28rem, 100%);
		margin: var(--gap-3xl) auto;
		animation: step-in var(--motion-base) var(--motion-ease-out);
	}

	.step[data-direction='back'] {
		--from: calc(var(--gap-lg) * -1);
	}

	@keyframes step-in {
		from {
			opacity: 0;
			translate: var(--from, var(--gap-lg)) 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.step {
			animation: none;
		}
	}

	hgroup {
		display: grid;
		gap: var(--gap-sm);
	}

	h1 {
		margin: 0;
	}

	hgroup p,
	.muted {
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: var(--leading-tight);
	}

	ul {
		margin: 0;
		padding-inline-start: var(--gap-lg);
	}

	footer,
	.end {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
	}

	.end {
		margin-inline-start: auto;
	}
</style>
