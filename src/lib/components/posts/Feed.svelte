<script lang="ts">
	import { page } from '$app/state';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { feed } from '#lib/server/posts/posts.js';
	import { posts } from '#lib/strings/posts.js';
	import { calendarDay } from '#lib/time-zone.js';
	import PostRow from './PostRow.svelte';
	import { preloadInView } from '#lib/preload.js';

	type FeedItem = Awaited<ReturnType<typeof feed>>['items'][number];

	let {
		items,
		next,
		showProject
	}: { items: FeedItem[]; next: string | null; showProject: boolean } = $props();

	// Grouped by the day of each post's latest activity, the order the feed is sorted in.
	const groups = $derived.by(() => {
		const out: { key: string; label: string; items: FeedItem[] }[] = [];
		for (const item of items) {
			const at = new Date(item.lastActivityAt);
			const key = calendarDay(at, page.data.timeZone);
			const last = out[out.length - 1];
			if (last?.key === key) last.items.push(item);
			else out.push({ key, label: posts.feed.day(at, page.data.timeZone), items: [item] });
		}
		return out;
	});
</script>

{#if items.length === 0}
	<EmptyState title={posts.feed.empty} size="index">
		{#snippet icon()}<Icon name="post" size={32} />{/snippet}
	</EmptyState>
{:else}
	<div class="feed" {@attach preloadInView}>
		{#each groups as group (group.key)}
			<section class="day" aria-label={group.label}>
				<div class="day-heading" aria-hidden="true">
					<span>{group.label}</span>
				</div>
				<ul class="rows" role="list">
					{#each group.items as item (item.id)}
						<li><PostRow {item} {showProject} /></li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{/if}
{#if next}
	<!-- The pager keeps whichever feed page it's on and only swaps the query. -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<p class="more"><a href={`?cursor=${encodeURIComponent(next)}`}>{posts.feed.more}</a></p>
{/if}

<style>
	.feed {
		display: grid;
		gap: var(--gap-lg);
	}

	@media (min-width: 48rem) {
		.feed {
			gap: var(--gap-xl);
		}
	}

	@media (min-width: 64rem) {
		.feed {
			gap: 2rem;
		}
	}

	/* Campsite's day heading: 14px medium tertiary, then a hairline to the edge. */
	.day-heading {
		display: flex;
		gap: var(--gap-lg);
		align-items: center;
		padding-block: var(--gap-sm);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		line-height: 1.25rem;
	}

	.day-heading::after {
		flex: 1;
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
		content: '';
	}

	.rows {
		display: grid;
		gap: 1px;
		margin: 0 calc(var(--gap-sm) * -1);
		padding: var(--gap-xs) 0;
		list-style: none;
	}

	.more {
		margin: 0;
		padding: var(--gap-md) 0;
		font-size: var(--type-body);
	}

	.more a {
		color: var(--hue-z0-muted);
		text-decoration: none;
	}

	.more a:hover {
		color: var(--hue-z0-fg);
	}
</style>
