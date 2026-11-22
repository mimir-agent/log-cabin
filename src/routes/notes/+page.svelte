<script lang="ts">
	import { tick } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { DropdownMenu } from 'bits-ui';
	import NoteList from '#lib/components/notes/NoteList.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import FloatingAction from '#lib/components/shell/FloatingAction.svelte';
	import IndexColumn from '#lib/components/shell/IndexColumn.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import PageIcon from '#lib/components/shell/PageIcon.svelte';
	import ViewTabs from '#lib/components/shell/ViewTabs.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import SegmentedControl from '#lib/components/ui/SegmentedControl.svelte';
	import { core } from '#lib/strings/core.js';
	import { notes } from '#lib/strings/notes.js';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	const s = notes.list;
	const filters = ['all', 'created', 'forMe'] as const;
	const sorts = ['activity', 'created'] as const;

	type Query = { filter: (typeof filters)[number]; sort: (typeof sorts)[number]; q: string };
	const params = (query: Query) =>
		new URLSearchParams({
			filter: query.filter,
			sort: query.sort,
			...(query.q ? { q: query.q } : {})
		});
	const href = (change: Partial<Query>) =>
		`${resolve('/notes')}?${params({ ...data.query, ...change })}`;

	const views = $derived(
		filters.map((filter) => ({
			href: href({ filter }),
			label: s.filters[filter],
			current: data.query.filter === filter
		}))
	);

	// The layout changes the moment it's chosen and is saved for every device; a failed save
	// puts back the saved one. Saving doesn't reload the notes, so pages scrolled in stay.
	const layouts = ['list', 'grid'] as const;
	let layout = $derived(data.layout);
	let layoutForm: HTMLFormElement | undefined = $state();
	async function chooseLayout(next: (typeof layouts)[number]) {
		layout = next;
		await tick();
		layoutForm?.requestSubmit();
	}
	const keepLayout: SubmitFunction =
		() =>
		async ({ result }) => {
			if (result.type === 'success') return;
			console.error('saving the notes layout failed', result);
			layout = data.layout;
		};
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<!-- Campsite's notes index: the filters sit in the titlebar beside the name (in a strip under
     it on small screens), New note on the right (a floating pill on phones); the search and
     the order above the notes. -->
<PageHeader title={s.title}>
	{#snippet leading()}<span class="page-icon"><PageIcon tone="note" /></span>{/snippet}
	{#snippet tools()}<ViewTabs label={s.filtersLabel} {views} place="bar" />{/snippet}
	{#snippet actions()}
		<form method="POST" action="?/layout" bind:this={layoutForm} use:enhance={keepLayout}>
			<input type="hidden" name="layout" value={layout} />
			<SegmentedControl
				label={s.layoutLabel}
				size="sm"
				value={layout}
				options={layouts.map((value) => ({ value, label: s.layouts[value] }))}
				onValueChange={chooseLayout}
			/>
		</form>
		{#if data.canCreate}
			<span class="new"
				><Button href={resolve('/notes/new')} variant="primary" size="sm">{s.create}</Button></span
			>
		{/if}
	{/snippet}
</PageHeader>

<ViewTabs label={s.filtersLabel} {views} place="strip" />

{#if data.canCreate}<FloatingAction href={resolve('/notes/new')} label={s.create} />{/if}

<IndexColumn>
	<div class="find l:repel">
		<form method="GET" role="search">
			<input type="hidden" name="filter" value={data.query.filter} />
			<input type="hidden" name="sort" value={data.query.sort} />
			<label>
				<span class="u:visually-hidden">{s.search}</span>
				<input name="q" type="search" placeholder={s.search} value={data.query.q} />
			</label>
		</form>
		<Menu align="end">
			{#snippet trigger({ props })}
				<Button
					{...props}
					variant="ghost"
					size="sm"
					aria-label={s.sortedBy(s.sorts[data.query.sort])}
				>
					{s.sorts[data.query.sort]}
					<Icon name="chevron-down" />
				</Button>
			{/snippet}
			<DropdownMenu.RadioGroup value={data.query.sort}>
				{#each sorts as sort (sort)}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href() starts with resolve('/notes') -->
					<DropdownMenu.RadioItem value={sort} onSelect={() => goto(href({ sort }))}>
						{s.sorts[sort]}
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</Menu>
	</div>

	{#if data.notes.length === 0}
		<EmptyState
			title={data.query.q ? s.noMatches(data.query.q) : s.empty[data.query.filter]}
			size="index"
		>
			{#snippet icon()}<Icon name="note" size={32} />{/snippet}
			{#snippet action()}
				{#if data.canCreate && !data.query.q}
					<Button href={resolve('/notes/new')} variant="primary">{s.create}</Button>
				{/if}
			{/snippet}
		</EmptyState>
	{:else}
		<NoteList
			notes={data.notes}
			next={data.next}
			query={params(data.query).toString()}
			sort={data.query.sort}
			{layout}
		/>
	{/if}
</IndexColumn>

<style>
	.page-icon {
		display: none;
	}

	.find {
		--repel-gap: var(--gap-sm);
	}

	.find form {
		flex: 1;
		max-inline-size: 20rem;
	}

	.find input[type='search'] {
		inline-size: 100%;
	}

	@media (min-width: 64rem) {
		.page-icon {
			display: flex;
			margin-inline-end: 0.375rem;
		}
	}

	/* Below 1024px the floating pill carries New note. */
	@media (max-width: 63.99rem) {
		.new {
			display: none;
		}
	}
</style>
