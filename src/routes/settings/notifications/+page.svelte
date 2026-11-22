<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import FormStatus from '#lib/components/settings/FormStatus.svelte';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import SettingsFrame from '#lib/components/settings/SettingsFrame.svelte';
	import SettingsSection from '#lib/components/settings/SettingsSection.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { accountTabs } from '#lib/settings-nav.js';
	import { core } from '#lib/strings/core.js';
	import { notifications } from '#lib/strings/notifications.js';
	import PushToggle from './PushToggle.svelte';
	import PauseSection from './PauseSection.svelte';
	import ScheduleFields from './ScheduleFields.svelte';
	import DigestFields from './DigestFields.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = notifications.settings;
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<SettingsFrame
	title={s.title}
	avatar={{ name: data.user?.name ?? '', src: data.user?.avatarUrl }}
	tabs={accountTabs(page.url.pathname, data.calcomTab)}
>
	<form
		class="sections"
		method="POST"
		use:enhance={() =>
			({ update }) =>
				update({ reset: false })}
	>
		<SettingsSection title={s.kindsHeading} description={s.kindsIntro} flush>
			<table>
				<thead>
					<tr>
						<th scope="col">{s.kind}</th>
						<th scope="col">{s.email}</th>
						<th scope="col">{s.push}</th>
					</tr>
				</thead>
				<tbody>
					{#each data.kinds as kind (kind)}
						<tr>
							<th scope="row">{s.kinds[kind]}</th>
							<td>
								<input
									type="checkbox"
									name="email-{kind}"
									aria-label="{s.email}: {s.kinds[kind]}"
									checked={data.settings.emailKinds.includes(kind)}
								/>
							</td>
							<td>
								<input
									type="checkbox"
									name="push-{kind}"
									aria-label="{s.push}: {s.kinds[kind]}"
									checked={data.settings.pushKinds.includes(kind)}
								/>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#snippet footer()}
				<Button type="submit" variant="primary">{s.save}</Button>
			{/snippet}
		</SettingsSection>

		<SettingsSection title={s.scheduleHeading} description={s.scheduleIntro}>
			<ScheduleFields schedule={data.schedule} />
			{#snippet footer()}
				<FormStatus message={form?.scheduleError} />
				<Button type="submit" variant="primary">{s.save}</Button>
			{/snippet}
		</SettingsSection>

		<SettingsSection title={s.digestHeading} description={s.digestIntro}>
			<DigestFields settings={data.settings} />
			<SettingsField label={s.timezone}>
				{#snippet children({ id })}
					<select {id} name="timezone" value={data.timezone}>
						{#each data.timeZones as zone (zone)}
							<option value={zone}>{zone}</option>
						{/each}
					</select>
				{/snippet}
			</SettingsField>
			{#snippet footer()}
				<FormStatus message={form?.message} saved={form?.saved ? s.saved : undefined} />
				<Button type="submit" variant="primary">{s.save}</Button>
			{/snippet}
		</SettingsSection>
	</form>

	<PauseSection pausedUntil={data.pausedUntil} />
	<PushToggle vapidPublicKey={data.vapidPublicKey} />
</SettingsFrame>

<style>
	/* Two cards in one form, as far apart as the frame's own sections. */
	.sections {
		display: grid;
		gap: var(--gap-2xl);
	}

	/* The kinds as Campsite's settings rows: the name at 14px medium, one column per channel
	   with its heading at 12px in the third grey, hairlines between. */
	table {
		inline-size: 100%;
		border-collapse: collapse;
		font-size: var(--type-body);
		line-height: var(--leading-tight);
	}

	th,
	td {
		padding: var(--gap-md);
		text-align: start;
	}

	tbody tr {
		border-block-start: var(--border-w-hairline) solid var(--hue-border-secondary);
	}

	tbody th {
		font-weight: var(--fw-medium);
	}

	thead th {
		padding-block: var(--gap-sm);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
	}

	thead th:not(:first-child),
	td {
		inline-size: 4.5rem;
		text-align: center;
	}

	input[type='checkbox'] {
		inline-size: 1rem;
		block-size: 1rem;
		margin: 0;
		vertical-align: middle;
	}
</style>
