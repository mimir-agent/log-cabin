<!--
  The phone's home screen, after Campsite's: a search pill, the places as cards, then the
  projects. On a phone the sidebar has no room, so this is where it lives; the Home tab opens it.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import CreateMenu from '#lib/components/shell/CreateMenu.svelte';
	import FloatingAction from '#lib/components/shell/FloatingAction.svelte';
	import InstallPrompt from '#lib/components/shell/InstallPrompt.svelte';
	import PushPrompt from '#lib/components/shell/PushPrompt.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import PageIcon from '#lib/components/shell/PageIcon.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { calls } from '#lib/strings/calls.js';
	import { core } from '#lib/strings/core.js';
	import { notes } from '#lib/strings/notes.js';
	import { shell } from '#lib/strings/shell.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const s = shell.home;
	const ids = $props.id();
	let projectsOpen = $state(true);
	// The sidebar's Channels group keeps its state under this key; Home shares it.
	const storageKey = 'campfire:sidebar-projects';

	onMount(() => {
		projectsOpen = localStorage.getItem(storageKey) !== 'closed';
	});

	function toggleProjects() {
		projectsOpen = !projectsOpen;
		localStorage.setItem(storageKey, projectsOpen ? 'open' : 'closed');
	}

	const projects = $derived(
		data.sidebarProjects ? [...data.sidebarProjects.favorites, ...data.sidebarProjects.joined] : []
	);

	type Place = { href: string; label: string; tone: 'post' | 'note' | 'call' };
	const places: Place[] = [
		{ href: resolve('/'), label: s.posts, tone: 'post' },
		{ href: resolve('/notes'), label: notes.nav.notes, tone: 'note' },
		{ href: resolve('/calls'), label: calls.index.nav, tone: 'call' }
	];
</script>

<svelte:head>
	<title>{core.nav.home} · {core.appName}</title>
</svelte:head>

<PageHeader title={core.nav.home} />

<div class="home">
	<form class="search" method="GET" action={resolve('/search')} role="search">
		<input type="search" name="q" placeholder={s.search} aria-label={s.search} />
	</form>

	<ul class="places" role="list">
		{#each places as place (place.href)}
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved above -->
				<a class="place" href={place.href}>
					<PageIcon tone={place.tone} />
					{place.label}
				</a>
			</li>
		{/each}
	</ul>

	<!-- Empty unless the install or push prompt shows, so it adds no space of its own. -->
	<div class="install">
		<InstallPrompt appName={data.orgName ?? core.appName} />
		<PushPrompt vapidPublicKey={data.vapidPublicKey} />
	</div>

	{#if projects.length}
		<section class="section" aria-label={shell.projects}>
			<button
				type="button"
				class="section-head"
				aria-expanded={projectsOpen}
				aria-controls="{ids}-projects"
				onclick={toggleProjects}
			>
				<span class="chevron" aria-hidden="true"><Icon name="chevron-right" size={24} /></span>
				{shell.projects}
			</button>
			<ul class="rows" id="{ids}-projects" role="list" hidden={!projectsOpen}>
				{#each projects as project (project.id)}
					<li>
						<a class="row" href={resolve('/projects/[id]', { id: project.id })}>
							<Avatar name={project.name} accessory={project.accessory} size="sm" shape="square" />
							<span class="row-label">{project.name}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if projects[0]}
		<CreateMenu newPostHref={resolve('/projects/[id]/new', { id: projects[0].id })}>
			{#snippet button({ props })}
				<FloatingAction
					label={shell.create.button}
					rest={{ ...props, 'data-create-trigger': '', 'aria-label': shell.create.menuLabel }}
				/>
			{/snippet}
		</CreateMenu>
	{/if}
</div>

<style>
	.home {
		display: flex;
		flex-direction: column;
		padding-block-end: 5rem;
	}

	/* A 40px pill, 16px text so phones don't zoom into it. */
	.search {
		padding: var(--gap-lg) var(--gap-lg) 0;
	}

	.search input {
		inline-size: 100%;
		block-size: 2.5rem;
		padding-inline: var(--gap-lg) var(--gap-md);
		border: 1px solid transparent;
		border-radius: var(--radius-full);
		outline: none;
		background-color: light-dark(var(--hue-gray-100), var(--hue-gray-800));
		color: var(--hue-z0-fg);
		font: inherit;
		font-size: var(--text-md);
	}

	.search input::placeholder {
		color: var(--hue-z0-muted);
	}

	.search input:focus {
		border-color: var(--hue-blue-500);
		background-color: var(--hue-z2-bg);
	}

	.places {
		display: flex;
		gap: var(--gap-sm);
		margin: 0;
		padding: var(--gap-lg);
		overflow-x: auto;
		list-style: none;
		scrollbar-width: none;
	}

	.install {
		padding-inline: var(--gap-lg);
	}

	.install:not(:empty) {
		padding-block-end: var(--gap-lg);
	}

	.places li {
		display: flex;
		flex: 1;
		min-inline-size: 6.25rem;
	}

	/* Each place is a small raised card: its mark, then its name at 15px medium. */
	.place {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--gap-sm);
		padding: var(--gap-md) var(--gap-md) 0.625rem;
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: 0.625rem;
		background-color: var(--hue-z2-bg);
		color: var(--hue-z0-fg);
		font-size: 0.9375rem;
		font-weight: var(--fw-medium);
		text-decoration: none;
	}

	.place:active {
		background-color: var(--hue-pressed);
	}

	.section {
		padding-block: var(--gap-md);
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
	}

	.section-head {
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		inline-size: 100%;
		padding: var(--gap-sm) var(--gap-lg);
		border: 0;
		background: none;
		color: var(--hue-z0-muted);
		font: inherit;
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		text-align: start;
		cursor: pointer;
	}

	.chevron {
		display: grid;
		color: var(--hue-text-quaternary);
		transition: rotate 200ms var(--motion-ease);
	}

	.section-head[aria-expanded='true'] .chevron {
		rotate: 90deg;
	}

	.rows {
		display: grid;
		gap: 0.125rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* `display: grid` beats the browser's `[hidden] { display: none }`. */
	.rows[hidden] {
		display: none;
	}

	/* 44px rows: a 24px mark, the name at 16px in the tertiary grey. */
	.row {
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		padding: 0.625rem var(--gap-lg);
		color: var(--hue-z0-muted);
		font-size: var(--text-md);
		line-height: 1.5rem;
		text-decoration: none;
	}

	.row:active {
		background-color: var(--hue-pressed);
	}

	.row-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}
</style>
