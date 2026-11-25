<script lang="ts">
	import type { Snippet } from 'svelte';
	import { DropdownMenu } from 'bits-ui';
	import type { NavItem } from '#lib/nav.js';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import { shell } from '#lib/strings/shell.js';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import AccountMenu from './AccountMenu.svelte';
	import Avatar from './Avatar.svelte';
	import CreateMenu from './CreateMenu.svelte';
	import GroupToggle from './GroupToggle.svelte';
	import SidebarLink from './SidebarLink.svelte';
	import { preloadInView } from '#lib/preload.js';
	import type { Status } from '#lib/people/status.js';

	type Props = {
		orgName: string;
		orgLogoUrl?: string | null;
		userName: string;
		username: string;
		userAvatarUrl?: string | null;
		/** Your own status, if you have one set. */
		status: Status | null;
		items: NavItem[];
		currentPath: string;
		counts?: Record<string, number>;
		live?: Record<string, string>;
		/** Where "New post" goes. Hidden when there's nowhere to post. */
		newPostHref?: string;
		/** The Favorites group: SidebarLinks for favorite projects, threads and notes. */
		favorites?: Snippet;
		/** The projects list: SidebarLinks, one per project. */
		projects?: Snippet;
		/** Adds "New project" to the projects group. */
		canCreateProject?: boolean;
		userMenu?: Snippet;
	};

	let {
		orgName,
		orgLogoUrl,
		userName,
		username,
		userAvatarUrl,
		status,
		items,
		currentPath,
		counts = {},
		live = {},
		newPostHref,
		favorites,
		projects,
		canCreateProject = false,
		userMenu
	}: Props = $props();

	const projectsRowsId = $props.id();
	const favoritesRowsId = `${projectsRowsId}-favorites`;
	const newProjectHref = '/projects#new-project';

	// Home matches only itself; every other item also owns the pages under it.
	const isCurrent = (href: string) =>
		href === '/' ? currentPath === '/' : currentPath === href || currentPath.startsWith(`${href}/`);

	const main = $derived(items.filter((item) => (item.place ?? 'main') === 'main'));
	const header = $derived(items.filter((item) => item.place === 'header'));
	const search = $derived(header.find((item) => item.href === '/search'));
	const tools = $derived(header.filter((item) => item !== search));
	const account = $derived(items.filter((item) => item.place === 'account'));
	const projectsLink = $derived(items.find((item) => item.href === '/projects'));
	// The org switcher's menu, in Campsite's order: people, projects, then the settings.
	const org = $derived(items.filter((item) => item.place === 'org'));
	const orgPeople = $derived(org.filter((item) => item.href === '/members'));
	const orgSettings = $derived(org.filter((item) => item.href !== '/members'));

	// A closed group still shows the project you're in, so the sidebar never hides where you are.
	let projectsOpen = $state(true);
	let favoritesOpen = $state(true);
</script>

<div class="sidebar" {@attach preloadInView}>
	<div class="head">
		<div class="head-row">
			<Menu align="start" minWidth="17.5rem">
				{#snippet trigger({ props })}
					<button {...props} type="button" class="org" data-focus="inset">
						<Avatar name={orgName} src={orgLogoUrl} size="xs" shape="square" />
						<span class="org-name">{orgName}</span>
						<span class="org-chevron" aria-hidden="true"><Icon name="chevron-select" /></span>
					</button>
				{/snippet}
				{#each orgPeople as item (item.href)}
					{@render menuLink(item.href, item.label, item.icon)}
				{/each}
				{#if projectsLink}
					{@render menuLink(projectsLink.href, projectsLink.label, projectsLink.icon)}
				{/if}
				{#if orgSettings.length}
					<DropdownMenu.Separator />
					{#each orgSettings as item (item.href)}
						{@render menuLink(item.href, item.label, item.icon)}
					{/each}
				{/if}
			</Menu>
			<span class="spacer"></span>
			{#each tools as tool (tool.href)}
				<IconButton
					href={tool.href}
					icon={tool.icon ?? 'bolt'}
					label={tool.label}
					aria-current={isCurrent(tool.href) ? 'page' : undefined}
				/>
			{/each}
		</div>
		<div class="head-row">
			{#if newPostHref}
				<CreateMenu {newPostHref}>
					{#snippet button({ props })}
						<button
							{...props}
							type="button"
							class="new-post"
							data-press
							data-create-trigger
							aria-label={shell.create.menuLabel}
						>
							{shell.create.button}
						</button>
					{/snippet}
				</CreateMenu>
			{:else}
				<span class="spacer"></span>
			{/if}
			{#if search}
				<IconButton
					href={search.href}
					icon="search"
					label={search.label}
					aria-current={isCurrent(search.href) ? 'page' : undefined}
				/>
			{/if}
		</div>
	</div>

	<div class="scroll">
		<nav aria-label={core.nav.label}>
			<ul class="group" role="list">
				{#each main as item (item.href)}
					<li>
						<SidebarLink
							href={item.href}
							current={isCurrent(item.href)}
							count={counts[item.href]}
							unread={(counts[item.href] ?? 0) > 0}
							live={live[item.href]}
						>
							{#snippet leading()}
								{#if item.icon}<Icon name={item.icon} />{/if}
							{/snippet}
							{item.label}
						</SidebarLink>
					</li>
				{/each}
			</ul>
		</nav>

		{#if favorites}
			<!-- Campsite's Favorites group, above the projects: favorite projects, threads and notes. -->
			<section class="group" aria-label={shell.favorites}>
				<div class="group-head">
					<GroupToggle
						bind:open={favoritesOpen}
						controls={favoritesRowsId}
						storageKey="campfire:sidebar-favorites"
					>
						{shell.favorites}
					</GroupToggle>
				</div>
				<div class="rows" id={favoritesRowsId} data-collapsed={favoritesOpen ? undefined : ''}>
					{@render favorites()}
				</div>
			</section>
		{/if}

		{#if projects}
			<section class="group" aria-label={shell.projects}>
				<div class="group-head">
					<GroupToggle
						bind:open={projectsOpen}
						controls={projectsRowsId}
						storageKey="campfire:sidebar-projects"
					>
						{shell.projects}
					</GroupToggle>
					<Menu align="start">
						{#snippet trigger({ props })}
							<button
								{...props}
								type="button"
								class="group-action"
								aria-label={core.actions.more}
								title={core.actions.more}
							>
								<Icon name="dots-horizontal" size={17} />
							</button>
						{/snippet}
						{#if canCreateProject}
							{@render menuLink(newProjectHref, posts.projects.create, 'plus')}
						{/if}
						{@render menuLink('/projects', shell.browseProjects, 'compass')}
					</Menu>
				</div>
				<div class="rows" id={projectsRowsId} data-collapsed={projectsOpen ? undefined : ''}>
					{@render projects()}
					{#if canCreateProject}
						<div class="trailing">
							<SidebarLink href={newProjectHref}>
								{#snippet leading()}<Icon name="plus" />{/snippet}
								{posts.projects.create}
							</SidebarLink>
						</div>
					{/if}
				</div>
			</section>
		{/if}
	</div>

	<div class="foot">
		{#if userMenu}
			{@render userMenu()}
		{:else}
			<AccountMenu
				{userName}
				{username}
				avatarUrl={userAvatarUrl}
				{status}
				items={account}
				variant="sidebar"
			/>
		{/if}
	</div>
</div>

{#snippet menuLink(href: string, label: string, icon?: NavItem['icon'])}
	<DropdownMenu.Item>
		{#snippet child({ props })}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- registered in #lib/nav -->
			<a {...props} {href}>
				{#if icon}<Icon name={icon} />{/if}
				{label}
			</a>
		{/snippet}
	</DropdownMenu.Item>
{/snippet}

<style>
	/* Campsite's sidebar: 240px, the page's own white, a hairline on the right. */
	.sidebar {
		display: flex;
		flex-direction: column;
		block-size: 100%;
		padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom) env(safe-area-inset-left);
		border-inline-end: var(--border-w-hairline) solid var(--hue-z0-border);
		background-color: var(--hue-z0-bg);
		color: var(--hue-z0-fg);
		font-size: var(--type-body);
		line-height: 1.25rem;
	}

	.head {
		display: grid;
		gap: 0.375rem;
		padding: var(--gap-md);
	}

	.head-row {
		display: flex;
		gap: var(--gap-xs);
		align-items: center;
		min-inline-size: 0;
	}

	/* The org switcher: as wide as its name, 32px tall (44px on a coarse pointer), a grey fill
	   on hover or while open. The chevrons say it opens something, in the tertiary grey so
	   the name leads. */
	.org {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-inline-size: 0;
		block-size: 2rem;
		padding: 0.375rem;
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: inherit;
		font: inherit;
		font-weight: var(--fw-medium);
		text-align: start;
		cursor: pointer;
	}

	.org:hover,
	.org[data-state='open'] {
		background-color: var(--hue-selected);
	}

	.org-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.org-chevron {
		display: grid;
		flex: none;
		color: var(--hue-z0-muted);
	}

	.spacer {
		flex: 1;
	}

	/* Campsite's "New post": a full-width raised base button with no icon. */
	.new-post {
		position: relative;
		display: inline-flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		block-size: var(--control-h-sm);
		padding-inline: 0.625rem;
		border-radius: var(--radius-control);
		background-color: light-dark(var(--hue-white), var(--hue-gray-750));
		box-shadow: var(--shadow-button);
		border: 0;
		color: var(--hue-z0-fg);
		font: inherit;
		font-weight: var(--fw-medium);
		cursor: pointer;
	}

	.new-post::before {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		background-image: linear-gradient(to bottom, rgb(255 255 255 / 0.12), transparent);
		opacity: 0;
		content: '';
		transition: opacity var(--motion-fast) var(--motion-ease);
	}

	.new-post:hover::before {
		opacity: 1;
	}

	.scroll {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: none;
	}

	.group {
		display: grid;
		gap: 1px;
		margin: 0;
		padding: 0 var(--gap-md) var(--gap-sm);
		list-style: none;
	}

	section.group {
		padding-block-start: var(--gap-sm);
	}

	.rows {
		display: grid;
		gap: 1px;
	}

	/* Closed, a group keeps only where you are and, as Campsite's Favorites do, what's unread. */
	.rows[data-collapsed]
		> :global(:not([aria-current='page'], :has([aria-current='page']), [data-unread])) {
		display: none;
	}

	/* The group header: the fold button, then its one action, which waits for the pointer. */
	.group-head {
		display: flex;
		gap: 1px;
		align-items: center;
	}

	.group-action {
		display: grid;
		place-items: center;
		inline-size: 1.5rem;
		block-size: 1.5rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--hue-z0-muted);
		opacity: 0;
		cursor: pointer;
	}

	.group-action:hover,
	.group-action[data-state='open'] {
		background-color: var(--hue-selected);
		color: var(--hue-z0-fg);
	}

	.group:hover .group-action,
	.group-action:focus-visible,
	.group-action[data-state='open'] {
		opacity: 1;
	}

	/* Touch has no hover, so the action stays in view. */
	@media (hover: none) {
		.group-action {
			opacity: 1;
		}
	}

	.foot {
		display: flex;
		align-items: center;
		padding: 0.375rem var(--gap-md) var(--gap-md);
	}

	.foot :global(form) {
		display: contents;
	}

	@media (pointer: coarse) {
		.org,
		.new-post {
			min-block-size: var(--tap-min);
		}
	}
</style>
