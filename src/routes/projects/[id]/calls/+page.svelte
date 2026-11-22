<script lang="ts">
	import { resolve } from '$app/paths';
	import CallList from '#lib/components/calls/CallList.svelte';
	import CallsPanel from '#lib/components/calls/CallsPanel.svelte';
	import IndexColumn from '#lib/components/shell/IndexColumn.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { calls } from '#lib/strings/calls.js';
	import { core } from '#lib/strings/core.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = calls.index;
</script>

<svelte:head>
	<title>{s.projectTitle(data.project.name)} · {core.appName}</title>
</svelte:head>

<PageHeader title={s.projectTitle(data.project.name)}>
	{#snippet description()}
		<a href={resolve('/projects/[id]', { id: data.project.id })}>{s.back(data.project.name)}</a>
	{/snippet}
</PageHeader>

<IndexColumn>
	{#if data.live}
		<CallsPanel live={data.live} recent={[]} />
	{/if}
	<CallList calls={data.calls} more={data.more} empty={s.empty.project} showPlace={false} />
</IndexColumn>
