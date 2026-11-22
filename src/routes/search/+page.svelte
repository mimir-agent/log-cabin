<script lang="ts">
	import { resolve } from '$app/paths';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import ListRow from '#lib/components/shell/ListRow.svelte';
	import PageColumns from '#lib/components/shell/PageColumns.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Marked from '#lib/components/search/Marked.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { searchKinds, untitled } from '#lib/search.js';
	import { core } from '#lib/strings/core.js';
	import { search } from '#lib/strings/search.js';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	const s = search.page;

	const kindHref = (kind: string | null) =>
		`${resolve('/search')}?${new URLSearchParams(kind ? { q: data.q, kind } : { q: data.q })}`;
	const exactHref = $derived(`${kindHref(data.kind)}&exact`);
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<PageHeader title={s.title} />

<PageColumns>
	<form class="query" method="get" action={resolve('/search')} role="search">
		<label class="u:visually-hidden" for="search-q">{s.label}</label>
		<input id="search-q" name="q" type="search" value={data.q} placeholder={s.placeholder} />
		{#if data.kind}<input type="hidden" name="kind" value={data.kind} />{/if}
		<Button type="submit">{s.submit}</Button>
	</form>

	<nav class="tabs" aria-label={s.kindsLabel}>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- kindHref resolves the path -->
		<a href={kindHref(null)} aria-current={data.kind === null ? 'page' : undefined}>{s.kinds.all}</a
		>
		{#each searchKinds as kind (kind)}
			<a href={kindHref(kind)} aria-current={data.kind === kind ? 'page' : undefined}
				>{s.kinds[kind]}</a
			>
		{/each}
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</nav>

	{#if !data.q.trim()}
		<EmptyState title={s.start} />
	{:else if data.hits.length === 0}
		<EmptyState title={s.none(data.q)}>
			<!-- Campsite's EmptySearchResults: two blank cards leaning apart, which lean further
			     when the pointer finds them. -->
			{#snippet icon()}
				<span class="no-results" aria-hidden="true"><span></span><span></span></span>
			{/snippet}
		</EmptyState>
	{:else}
		{#if data.correction}
			<p class="correction">
				{s.showingFor} <strong>{data.correction}</strong>.
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- exactHref resolves the path -->
				{s.searchInstead} <a href={exactHref}>{data.q}</a>
			</p>
		{/if}
		<ul class="list" role="list">
			{#each data.hits as hit (hit.kind + hit.id)}
				<li>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- hrefs are app paths built by search -->
					<ListRow href={hit.href}>
						{#snippet description()}<Marked text={hit.snippet} />{/snippet}
						{#snippet meta()}
							{s.kindOf[hit.kind]}{#if hit.projectName}&nbsp;· {hit.projectName}{/if}
						{/snippet}
						{#if hit.title}<Marked text={hit.title} />{:else}{untitled(hit.kind)}{/if}
					</ListRow>
				</li>
			{/each}
		</ul>
	{/if}
</PageColumns>

<style>
	.no-results {
		position: relative;
		display: block;
		inline-size: 8rem;
		block-size: 8rem;
	}

	.no-results > span {
		position: absolute;
		inset: 1rem auto auto 50%;
		inline-size: 5rem;
		block-size: 6rem;
		margin-inline-start: -2.5rem;
		border: var(--border-w-hairline) solid var(--hue-menu-border);
		border-radius: var(--radius-control);
		background-color: var(--hue-z2-bg);
		box-shadow: var(--shadow-card);
		rotate: 5deg;
		transition:
			rotate var(--motion-fast) var(--motion-ease),
			scale var(--motion-fast) var(--motion-ease),
			box-shadow var(--motion-fast) var(--motion-ease);
	}

	.no-results > span + span {
		rotate: -5deg;
	}

	@media (hover: hover) {
		.no-results:hover > span {
			rotate: 9deg;
			scale: 1.05;
			box-shadow: var(--shadow-menu);
		}

		.no-results:hover > span + span {
			rotate: -9deg;
		}
	}

	.query {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		padding: var(--gap-md) var(--gap-lg) 0;
	}

	.query input[type='search'] {
		flex: 1;
		block-size: var(--control-h-md);
		padding-inline: var(--gap-sm);
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-control);
		background-color: var(--hue-z0-bg);
		color: var(--hue-z0-fg);
		font-size: var(--type-control);
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
		padding: var(--gap-sm) var(--gap-lg);
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
	}

	.tabs a {
		padding: var(--gap-xs) var(--gap-sm);
		border-radius: var(--radius-control);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: var(--leading-ui);
		text-decoration: none;
	}

	.tabs a:hover,
	.tabs a[aria-current='page'] {
		background-color: var(--hue-hover);
		color: var(--hue-z0-fg);
	}

	.tabs a[aria-current='page'] {
		font-weight: var(--fw-medium);
	}

	.correction {
		margin: 0;
		padding: var(--gap-md) var(--gap-lg) var(--gap-xs);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
	}

	.correction strong {
		color: var(--hue-z0-fg);
		font-weight: var(--fw-medium);
	}

	.list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.list > li {
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
	}
</style>
