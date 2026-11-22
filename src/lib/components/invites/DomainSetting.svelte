<script lang="ts">
	import { untrack } from 'svelte';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import SegmentedControl from '#lib/components/ui/SegmentedControl.svelte';
	import type { DomainJoin } from '#lib/server/db/schema/core.js';
	import { auth } from '#lib/strings/auth.js';
	import { invites } from '#lib/strings/invites.js';

	type Props = {
		domain: string;
		mode: DomainJoin;
		/** Why the domain was refused, shown under it. */
		error?: string;
	};

	let { domain, mode, error }: Props = $props();
	// Starts at the saved mode; after that it's the person's choice until they save.
	let chosen = $state(untrack(() => mode));
	const s = invites.domain;
	const modes = (['off', 'direct', 'request'] as const).map((value) => ({
		value,
		label: s.modes[value]
	}));
</script>

<!-- The org's email domain and what signing in with an address there does without an invite. -->
<SettingsField label={auth.orgSettings.domain} hint={auth.orgSettings.domainHint} {error}>
	{#snippet children({ id, hintId })}
		<input
			{id}
			name="domain"
			placeholder="example.com"
			value={domain}
			aria-describedby={hintId}
			aria-invalid={error ? 'true' : undefined}
		/>
	{/snippet}
</SettingsField>
<div class="mode">
	<span class="label">{s.mode}</span>
	<SegmentedControl label={s.mode} options={modes} bind:value={chosen} />
	<input type="hidden" name="domainJoin" value={chosen} />
	<p class="hint">{s.hints[chosen]}</p>
</div>

<style>
	.mode {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--gap-sm);
	}

	.label {
		color: var(--hue-text-secondary);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
		line-height: 1rem;
	}

	.hint {
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: var(--leading-tight);
	}
</style>
