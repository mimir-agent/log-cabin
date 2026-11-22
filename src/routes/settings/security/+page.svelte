<script lang="ts">
	import { page } from '$app/state';
	import FormStatus from '#lib/components/settings/FormStatus.svelte';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import SettingsFrame from '#lib/components/settings/SettingsFrame.svelte';
	import SettingsSection from '#lib/components/settings/SettingsSection.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { accountTabs } from '#lib/settings-nav.js';
	import { auth } from '#lib/strings/auth.js';
	import { core } from '#lib/strings/core.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = auth.security;
	const twoFactorLine = $derived(
		data.twoFactor.enabled
			? `${s.twoFactorOn} ${s.codesLeft(data.twoFactor.codesLeft)}`
			: data.enrolment
				? s.scan
				: s.twoFactorOff
	);
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<SettingsFrame
	title={s.title}
	avatar={{ name: data.user?.name ?? '', src: data.user?.avatarUrl }}
	tabs={accountTabs(page.url.pathname, data.calcomTab)}
>
	<form method="POST" action="?/password">
		<SettingsSection
			title={s.passwordHeading}
			description={data.hasPassword ? s.passwordSet : s.passwordNone}
		>
			{#if data.hasPassword}
				<SettingsField label={s.currentPassword}>
					{#snippet children({ id })}
						<input {id} name="current" type="password" required autocomplete="current-password" />
					{/snippet}
				</SettingsField>
			{/if}
			<SettingsField label={s.newPassword} hint={s.passwordHint(data.minLength)}>
				{#snippet children({ id, hintId })}
					<input
						{id}
						name="password"
						type="password"
						required
						minlength={data.minLength}
						autocomplete="new-password"
						aria-describedby={hintId}
					/>
				{/snippet}
			</SettingsField>
			{#snippet footer()}
				<FormStatus
					message={form?.passwordMessage}
					saved={form?.passwordSaved ? s.passwordSaved : undefined}
				/>
				<Button type="submit" variant="primary">
					{data.hasPassword ? s.changePassword : s.setPassword}
				</Button>
			{/snippet}
		</SettingsSection>
	</form>

	{#if !data.twoFactor.enabled && !data.enrolment}
		<SettingsSection title={s.twoFactorHeading} description={twoFactorLine}>
			{#snippet footer()}
				<FormStatus
					message={form?.twoFactorMessage}
					saved={form?.twoFactorDisabled ? s.disabled : undefined}
				/>
				<form method="POST" action="?/startTwoFactor">
					<Button type="submit">{s.turnOn}</Button>
				</form>
			{/snippet}
		</SettingsSection>
	{:else}
		<SettingsSection title={s.twoFactorHeading} description={twoFactorLine}>
			<FormStatus message={form?.twoFactorMessage} />
			{#if form?.recoveryCodes}
				<div class="codes">
					<h3>{s.codesTitle}</h3>
					<p>{s.codesIntro}</p>
					<ol>
						{#each form.recoveryCodes as recoveryCode (recoveryCode)}
							<li><code>{recoveryCode}</code></li>
						{/each}
					</ol>
				</div>
			{/if}
			{#if data.enrolment}
				<img class="qr" src={data.enrolment.qr} alt={s.qrAlt} />
				<p class="key">{s.manualKey}: <code>{data.enrolment.secret}</code></p>
				<form class="inline" method="POST" action="?/confirmTwoFactor">
					<SettingsField label={s.confirmCode}>
						{#snippet children({ id })}
							<input {id} name="code" required autocomplete="one-time-code" inputmode="numeric" />
						{/snippet}
					</SettingsField>
					<Button type="submit">{s.confirm}</Button>
				</form>
			{:else}
				<form class="inline" method="POST" action="?/regenerateCodes">
					<SettingsField label={s.regenerateCode}>
						{#snippet children({ id })}
							<input {id} name="code" required autocomplete="one-time-code" inputmode="numeric" />
						{/snippet}
					</SettingsField>
					<Button type="submit">{s.regenerate}</Button>
				</form>
				<form class="inline" method="POST" action="?/disableTwoFactor">
					<SettingsField label={s.disableCode}>
						{#snippet children({ id })}
							<input {id} name="code" required autocomplete="one-time-code" spellcheck="false" />
						{/snippet}
					</SettingsField>
					<Button type="submit" variant="danger">{s.disable}</Button>
				</form>
			{/if}
		</SettingsSection>
	{/if}
</SettingsFrame>

<style>
	/* A code and the button it goes with, side by side; stacked on a phone. */
	.inline {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-md);
		align-items: flex-end;
	}

	.inline > :global(.field) {
		flex: 1;
		min-inline-size: 12rem;
	}

	.codes {
		display: grid;
		gap: var(--gap-sm);
	}

	.codes h3 {
		margin: 0;
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
	}

	.codes p,
	.key {
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
	}

	.codes ol {
		margin: 0;
		columns: 2;
		font-family: var(--ff-mono);
	}

	/* Scanners need dark squares on light, in dark mode too. */
	.qr {
		inline-size: 12rem;
		padding: var(--gap-sm);
		background: var(--hue-white);
	}
</style>
