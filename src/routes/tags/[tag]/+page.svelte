<script lang="ts">
	import Feed from '#lib/components/posts/Feed.svelte';
	import FeedPage from '#lib/components/posts/FeedPage.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const title = $derived(posts.tags.title(data.tag));
</script>

<svelte:head>
	<title>{title} · {core.appName}</title>
</svelte:head>

<!-- A tag's posts read like any feed: the same column as Home and a project. -->
<PageHeader {title}>
	{#snippet description()}{posts.tags.description}{/snippet}
</PageHeader>
<FeedPage>
	<Feed items={data.items} next={data.next} showProject />
</FeedPage>
