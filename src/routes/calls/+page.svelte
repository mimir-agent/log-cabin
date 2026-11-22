<script lang="ts">
	import { resolve } from '$app/paths';
	import CallList from '#lib/components/calls/CallList.svelte';
	import LiveCallRow from '#lib/components/calls/LiveCallRow.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import FloatingAction from '#lib/components/shell/FloatingAction.svelte';
	import IndexColumn from '#lib/components/shell/IndexColumn.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import PageIcon from '#lib/components/shell/PageIcon.svelte';
	import ViewTabs from '#lib/components/shell/ViewTabs.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { calls } from '#lib/strings/calls.js';
	import { calcom } from '#lib/strings/calcom.js';
	import { core } from '#lib/strings/core.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = calls.index;
	const views = $derived(
		data.enabled
			? data.filters.map((filter) => ({
					href: `${resolve('/calls')}?filter=${filter}`,
					label: s.tabs[filter],
					current: filter === data.filter
				}))
			: []
	);
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<!-- Campsite's calls index: the views beside the name in the titlebar (a strip under it on
     small screens), the call action on the right (a floating pill on phones), and past calls
     grouped by day. -->
<PageHeader title={s.title}>
	{#snippet leading()}<span class="page-icon"><PageIcon tone="call" /></span>{/snippet}
	{#snippet tools()}
		{#if data.enabled}<ViewTabs label={s.tabsLabel} {views} place="bar" />{/if}
	{/snippet}
	{#snippet actions()}
		{#if data.enabled}
			<span class="wide">
				{#if data.calcom}
					<Button href={resolve('/settings/calcom')} variant="ghost" size="sm"
						>{calcom.settings.link}</Button
					>
				{/if}
				<!-- The personal room's own action starts a call there, or joins the one going on. -->
				<form method="POST" action="{data.roomPath}?/join">
					<Button type="submit" variant="primary" size="sm">
						<Icon name="video-camera-bolt" size={16} />{s.start}
					</Button>
				</form>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the calls module builds room paths -->
				<Button href={data.roomPath} variant="ghost" size="sm">{s.yourRoom}</Button>
			</span>
		{/if}
	{/snippet}
</PageHeader>

{#if data.enabled}
	<ViewTabs label={s.tabsLabel} {views} place="strip" />
	<FloatingAction href={data.roomPath} label={s.yourRoom} icon="video-camera" />
{/if}

<IndexColumn>
	{#if data.enabled}
		{#if data.live.length > 0}
			<section class="live" aria-label={s.live}>
				{#each data.live as call (call.id)}
					<LiveCallRow id={call.id} label={s.liveIn(call.place.name, call.names)} />
				{/each}
			</section>
		{/if}
		{#if data.calls.length === 0}
			<EmptyState
				title={s.empty[data.filter]}
				description={data.filter === 'all' ? s.emptyHint : undefined}
				size="index"
			>
				{#snippet icon()}<Icon name="video-camera" size={32} />{/snippet}
				{#snippet action()}
					<form method="POST" action="{data.roomPath}?/join">
						<Button type="submit" variant="primary">{s.start}</Button>
					</form>
				{/snippet}
			</EmptyState>
		{:else}
			<CallList calls={data.calls} more={data.more} empty={s.empty[data.filter]} />
		{/if}
	{:else}
		<EmptyState title={s.disabled}>
			{#snippet icon()}<Icon name="video-camera-off" size={32} />{/snippet}
		</EmptyState>
	{/if}
</IndexColumn>

<style>
	.page-icon {
		display: none;
	}

	.live {
		display: grid;
		gap: var(--gap-sm);
		margin-block-end: var(--gap-lg);
	}

	.wide {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
	}

	@media (min-width: 64rem) {
		.page-icon {
			display: flex;
			margin-inline-end: 0.375rem;
		}
	}

	/* Below 1024px the floating pill carries the call action. */
	@media (max-width: 63.99rem) {
		.wide {
			display: none;
		}
	}
</style>
