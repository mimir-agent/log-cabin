<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import IndexColumn from '#lib/components/shell/IndexColumn.svelte';
	import ListRow from '#lib/components/shell/ListRow.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import { time } from '#lib/strings/time.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = posts.drafts;
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<!-- Campsite's Drafts: the draft icon by the name, nothing on the right, then a plain list. -->
<PageHeader title={s.title}>
	{#snippet leading()}<span class="page-icon"><Icon name="post-draft" size={24} /></span>{/snippet}
</PageHeader>
<IndexColumn>
	{#if data.drafts.length === 0}
		<EmptyState title={s.empty} size="index">
			{#snippet icon()}<Icon name="post-draft" size={32} />{/snippet}
		</EmptyState>
	{:else}
		<ul class="list" role="list">
			{#each data.drafts as draft (draft.id)}
				<li>
					<ListRow href={resolve('/drafts/[id]', { id: draft.id })}>
						{#snippet description()}{s.inProject(draft.projectName)}{/snippet}
						{#snippet meta()}
							<time
								datetime={new Date(draft.updatedAt).toISOString()}
								title={time.long(draft.updatedAt, data.timeZone)}
								>{time.short(draft.updatedAt, data.timeZone)}</time
							>
						{/snippet}
						{draft.title || s.untitled}
					</ListRow>
				</li>
			{/each}
		</ul>
	{/if}
</IndexColumn>

<style>
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.page-icon {
		display: none;
	}

	@media (min-width: 64rem) {
		.page-icon {
			display: flex;
			margin-inline-end: 0.375rem;
		}
	}
</style>
