<script lang="ts">
	import { resolve } from '$app/paths';
	import NoteList from '#lib/components/notes/NoteList.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import IndexColumn from '#lib/components/shell/IndexColumn.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { core } from '#lib/strings/core.js';
	import { notes } from '#lib/strings/notes.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = notes.docs;
	const newNote = $derived(`${resolve('/notes/new')}?project=${data.project.id}`);
</script>

<svelte:head>
	<title>{s.title(data.project.name)} · {core.appName}</title>
</svelte:head>

<PageHeader title={s.title(data.project.name)}>
	{#snippet description()}
		<a href={resolve('/projects/[id]', { id: data.project.id })}>{s.back(data.project.name)}</a>
	{/snippet}
	{#snippet actions()}
		{#if data.canCreate}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- newNote starts with resolve('/notes/new') -->
			<Button href={newNote} variant="primary" size="sm">{notes.list.create}</Button>
		{/if}
	{/snippet}
</PageHeader>

<IndexColumn>
	{#if data.notes.length === 0}
		<EmptyState title={s.empty} size="index">
			{#snippet icon()}<Icon name="note" size={32} />{/snippet}
		</EmptyState>
	{:else}
		<NoteList
			notes={data.notes}
			next={data.next}
			query={`project=${encodeURIComponent(data.project.id)}`}
			sort="activity"
			layout="list"
			showProject={false}
		/>
	{/if}
</IndexColumn>
