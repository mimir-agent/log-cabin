<script lang="ts">
	import { resolve } from '$app/paths';
	import Badge from '#lib/components/shell/Badge.svelte';
	import IndexColumn from '#lib/components/shell/IndexColumn.svelte';
	import ListRow from '#lib/components/shell/ListRow.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import { time } from '#lib/strings/time.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = posts.versions;
</script>

<svelte:head>
	<title>{s.title} · {data.post.title} · {core.appName}</title>
</svelte:head>

<PageHeader title={s.title} back={resolve('/posts/[id]', { id: data.post.id })}>
	{#snippet description()}{data.post.title}{/snippet}
</PageHeader>
<IndexColumn>
	<ol class="list" role="list">
		{#each data.versions.toReversed() as version, i (version.id)}
			<li>
				<ListRow
					href={resolve('/posts/[id]', { id: version.id })}
					selected={version.id === data.post.id}
				>
					{#snippet description()}
						<time datetime={new Date(version.createdAt).toISOString()}
							>{time.long(version.createdAt, data.timeZone)}</time
						>
					{/snippet}
					{#snippet meta()}
						{#if version.id === data.post.id}<Badge>{s.current}</Badge>{/if}
						{#if i === 0}<Badge>{s.latest}</Badge>{/if}
					{/snippet}
					{s.label(version.version)} · {version.title}
				</ListRow>
			</li>
		{/each}
	</ol>
</IndexColumn>

<style>
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
