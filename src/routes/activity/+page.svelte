<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import ReasonAvatar from '#lib/components/shell/ReasonAvatar.svelte';
	import ViewTabs from '#lib/components/shell/ViewTabs.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { core } from '#lib/strings/core.js';
	import { notifications } from '#lib/strings/notifications.js';
	import { time } from '#lib/strings/time.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = notifications.activity;

	// Below 1024px Activity is the last of the inbox's views, as in Campsite's phone layout.
	const inboxTabs = Object.keys(
		notifications.inbox.tabs
	) as (keyof typeof notifications.inbox.tabs)[];
	const stripViews = [
		...inboxTabs.map((tab) => ({
			href: `${resolve('/inbox')}?tab=${tab}`,
			label: notifications.inbox.tabs[tab],
			current: false
		})),
		{ href: resolve('/activity'), label: notifications.nav.activity, current: true }
	];

	type Entry = (typeof data.entries)[number];

	// Campsite's activity sentence sets the person and the thing in ink and the verb between
	// them in grey. The strings start with the actor's name, so split it off to weigh it.
	function sentence(entry: Entry) {
		const line = entry.kind === 'post' ? s.posted(entry.actorName) : s.commented(entry.actorName);
		return line.startsWith(entry.actorName)
			? { actor: entry.actorName, verb: line.slice(entry.actorName.length) }
			: { actor: '', verb: line };
	}
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<PageHeader title={s.title}>
	{#snippet description()}{s.intro}{/snippet}
</PageHeader>
<ViewTabs label={notifications.inbox.tabsLabel} views={stripViews} place="strip" />

<div class="page">
	{#if data.entries.length === 0}
		<div class="empty">
			<EmptyState title={s.empty}>
				{#snippet icon()}
					<span class="empty-mark"><Icon name="bell" size={80} strokeWidth="1.5" /></span>
				{/snippet}
			</EmptyState>
		</div>
	{:else}
		<ul role="list" class="rows">
			{#each data.entries as entry (entry.url)}
				{@const words = sentence(entry)}
				<li class="row">
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- stored, already-resolved URL -->
					<a class="hit" href={entry.url} data-focus="inset">
						<span class="u:visually-hidden"
							>{words.actor}{words.verb}: {entry.postTitle}, {entry.projectName}, {time.long(
								entry.createdAt,
								data.timeZone
							)}</span
						>
					</a>
					<ReasonAvatar
						name={entry.actorName}
						icon={entry.kind === 'post' ? 'post' : 'chat-bubble'}
					/>
					<div class="text" aria-hidden="true">
						<p class="summary"><b>{words.actor}</b>{words.verb}: <b>{entry.postTitle}</b></p>
						<p class="place">
							<span class="project">{entry.projectName}</span>
							<time
								datetime={new Date(entry.createdAt).toISOString()}
								title={time.long(entry.createdAt, data.timeZone)}
								>{time.short(entry.createdAt, data.timeZone)}</time
							>
						</p>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	/* The inbox's column width, centred: one list of rows with no day groups, as Campsite's
	   Activity view is. */
	.page {
		display: flex;
		flex: 1;
		flex-direction: column;
		inline-size: 100%;
		max-inline-size: 37.5rem;
		margin-inline: auto;
	}

	.empty {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
	}

	.empty-mark {
		display: flex;
		color: light-dark(var(--hue-gray-300), var(--hue-gray-700));
	}

	.rows {
		display: grid;
		gap: 1px;
		margin: 0;
		padding: var(--gap-sm);
		list-style: none;
	}

	.row {
		position: relative;
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		min-block-size: 3rem;
		padding: 0.625rem;
		border-radius: var(--radius-surface);
	}

	.row:hover,
	.row:has(.hit:focus-visible) {
		background-color: light-dark(var(--hue-gray-100), var(--hue-gray-800));
	}

	.row:has(> .hit:active) {
		background-color: var(--hue-pressed);
	}

	.hit {
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}

	.text {
		display: grid;
		flex: 1;
		gap: var(--gap-xs);
		min-inline-size: 0;
		pointer-events: none;
	}

	/* 14px and tight, two lines at most: the verb in the secondary grey, names and titles in
	   ink. */
	.summary {
		display: -webkit-box;
		margin: 0;
		padding-block-start: 2px;
		overflow: hidden;
		color: var(--hue-text-secondary);
		font-size: var(--type-body);
		line-height: 1.25;
		overflow-wrap: anywhere;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.summary b {
		color: var(--hue-z0-fg);
		font-weight: var(--fw-medium);
	}

	/* Campsite puts the time at the end of the sentence. A long title clamped at two lines
	   would cut it off, so here it closes the project line, where it always shows. */
	.place {
		display: flex;
		gap: var(--gap-sm);
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: 1.25rem;
	}

	.project {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	time {
		flex: none;
	}
</style>
