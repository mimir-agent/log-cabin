<script lang="ts">
	import { page } from '$app/state';
	import ImagePicker from '#lib/components/settings/ImagePicker.svelte';
	import DomainSetting from '#lib/components/invites/DomainSetting.svelte';
	import FormStatus from '#lib/components/settings/FormStatus.svelte';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import SettingsFrame from '#lib/components/settings/SettingsFrame.svelte';
	import SettingsSection from '#lib/components/settings/SettingsSection.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Switch from '#lib/components/ui/Switch.svelte';
	import { orgTabs } from '#lib/settings-nav.js';
	import { auth } from '#lib/strings/auth.js';
	import { ai } from '#lib/strings/ai.js';
	import { calcom } from '#lib/strings/calcom.js';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = auth.orgSettings;
	const publicSettings = posts.publicLink.settings;
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<SettingsFrame
	title={s.title}
	avatar={{ name: data.org.name, src: data.org.logoUrl, shape: 'square' }}
	tabs={orgTabs(page.url.pathname)}
>
	<form method="POST" enctype="multipart/form-data">
		<SettingsSection title={data.org.name}>
			<div class="profile">
				<ImagePicker
					name={data.org.name}
					src={data.org.logoUrl}
					shape="square"
					inputName="logo"
					label={s.logo}
				/>
				<div class="fields">
					<SettingsField label={s.name}>
						{#snippet children({ id })}
							<input {id} name="name" required value={data.org.name} />
						{/snippet}
					</SettingsField>
					<DomainSetting domain={data.org.allowedEmailDomain} mode={data.org.domainJoin} />
				</div>
			</div>
			<!-- What the org turns on, one switch a row, each saying what "on" does. -->
			<div class="switches">
				<Switch
					name="google"
					checked={data.org.googleSignIn}
					label={s.google}
					description={data.googleConfigured ? undefined : s.googleUnconfigured}
				/>
				<Switch
					name="ai"
					checked={data.org.aiEnabled}
					label={ai.settings.label}
					description={data.aiConfigured ? ai.settings.hint : ai.settings.unconfigured}
				/>
				{#if data.calcomAvailable}
					<Switch
						name="calcom"
						checked={data.org.calcomEnabled}
						label={calcom.org.label}
						description={calcom.org.hint}
					/>
				{/if}
				<Switch
					name="publicPosts"
					checked={data.org.publicPosts}
					label={publicSettings.allow}
					description={publicSettings.allowHint}
				/>
				<Switch
					name="publicPostsIndexable"
					checked={data.org.publicPostsIndexable}
					label={publicSettings.index}
				/>
			</div>
			{#snippet footer()}
				<FormStatus message={form?.message} saved={form?.saved ? s.saved : undefined} />
				<Button type="submit" variant="primary">{s.save}</Button>
			{/snippet}
		</SettingsSection>
	</form>
</SettingsFrame>

<style>
	.profile {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: var(--gap-sm) var(--gap-xs) var(--gap-md);
	}

	.fields {
		display: grid;
		flex: 1;
		gap: 1.25rem;
		min-inline-size: 0;
	}

	/* Full-bleed rows under the fields, a hairline between each, as Campsite lists settings. */
	.switches {
		display: grid;
		margin: 0 calc(var(--gap-md) * -1) calc(var(--gap-md) * -1);
		border-block-start: 1px solid var(--hue-selected);
	}

	.switches > :global(*) {
		padding: var(--gap-md);
	}

	.switches > :global(* + *) {
		border-block-start: var(--border-w-hairline) solid var(--hue-border-secondary);
	}

	@media (min-width: 40rem) {
		.profile {
			flex-direction: row;
			gap: var(--gap-xl);
			padding-inline-start: var(--gap-md);
		}
	}
</style>
