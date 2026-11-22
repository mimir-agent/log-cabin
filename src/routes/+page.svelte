<script lang="ts">
	import { resolve } from '$app/paths';
	import ComposerRow from '#lib/components/posts/ComposerRow.svelte';
	import Feed from '#lib/components/posts/Feed.svelte';
	import FeedPage from '#lib/components/posts/FeedPage.svelte';
	import InstallPrompt from '#lib/components/shell/InstallPrompt.svelte';
	import PushPrompt from '#lib/components/shell/PushPrompt.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import PeopleRail from '#lib/components/shell/PeopleRail.svelte';
	import Banner from '#lib/components/ui/Banner.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { core } from '#lib/strings/core.js';
	import { onboarding } from '#lib/strings/onboarding.js';
	import { posts } from '#lib/strings/posts.js';
	import { shell } from '#lib/strings/shell.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const firstProject = $derived(
		data.sidebarProjects?.favorites[0] ?? data.sidebarProjects?.joined[0]
	);
</script>

<svelte:head>
	<title>{posts.feed.homeTitle} · {core.appName}</title>
</svelte:head>

<!-- On a phone, Home is the screen of places; this feed is one of them. Campsite's Home has
     no titlebar on wide screens: a 36px bold title, the composer, then the feed. -->
<PageHeader title={shell.home.posts} mobileOnly />
<div class="home">
	<FeedPage title={posts.feed.homeTitle}>
		{#if data.onboarding}
			<Banner>
				{onboarding.banner.text}
				{#snippet action()}
					<span class="unfinished">
						<form method="POST" action="/onboarding?/dismiss">
							<Button type="submit" variant="ghost" size="sm">{onboarding.banner.dismiss}</Button>
						</form>
						<Button href={resolve('/onboarding')} size="sm">{onboarding.banner.resume}</Button>
					</span>
				{/snippet}
			</Banner>
		{/if}
		<InstallPrompt appName={data.orgName ?? core.appName} />
		<PushPrompt vapidPublicKey={data.vapidPublicKey} />
		{#if firstProject && data.user}
			<ComposerRow href={resolve('/projects/[id]/new', { id: firstProject.id })} user={data.user} />
		{/if}
		<Feed items={data.items} next={data.next} showProject />
	</FeedPage>
	{#if data.people.length}
		<PeopleRail people={data.people} viewerId={data.user?.id} />
	{/if}
</div>

<style>
	.home {
		display: flex;
		flex: 1;
		align-items: stretch;
	}

	.unfinished {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
	}
</style>
