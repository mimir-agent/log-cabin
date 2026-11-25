<script lang="ts" module>
	import { getContext, setContext } from 'svelte';

	type ShellContext = { openNav: () => void; orgName: string; orgLogoUrl?: string | null };
	const key = Symbol('shell');

	/** What a page header needs from the shell on small screens: the org mark that opens the nav. */
	export function shellContext(): ShellContext | undefined {
		return getContext<ShellContext | undefined>(key);
	}

	function provideShell(value: ShellContext) {
		setContext(key, value);
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog } from 'bits-ui';
	import { afterNavigate } from '$app/navigation';
	import { navigating } from '$app/state';
	import { nav } from '#lib/nav.js';
	import { hasRole } from '#lib/roles.js';
	import type { Role } from '#lib/server/db/schema/index.js';
	import type { Status } from '#lib/people/status.js';
	import { shell } from '#lib/strings/shell.js';
	import AccountMenu from './AccountMenu.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Sidebar from './Sidebar.svelte';
	import { preloadInView } from '#lib/preload.js';

	type Props = {
		orgName: string;
		orgLogoUrl?: string | null;
		userName: string;
		username: string;
		userAvatarUrl?: string | null;
		/** Your own status, if you have one set. */
		status: Status | null;
		role: Role;
		/** The current path, to mark the current nav item. */
		currentPath: string;
		/** Unread counts by nav href, e.g. `{ '/inbox': 3 }`. */
		counts?: Record<string, number>;
		/** Nav hrefs with something live in them, each with what a screen reader hears: `{ '/calls': '1 call live' }`. */
		live?: Record<string, string>;
		/** Where the New menu's post row goes. */
		newPostHref?: string;
		/** The sidebar's favorite projects, threads and notes. */
		favorites?: Snippet;
		/** The sidebar's projects list. */
		projects?: Snippet;
		/** Replaces the sidebar's footer (avatar and account menu). */
		userMenu?: Snippet;
		children: Snippet;
	};

	let { role, children, ...sidebar }: Props = $props();

	const items = $derived(nav.filter((item) => hasRole(role, item.minRole ?? 'guest')));
	const tabs = $derived(items.filter((item) => item.tab));
	const account = $derived(items.filter((item) => item.place === 'account'));
	const canCreateProject = $derived(hasRole(role, 'member'));
	let navOpen = $state(false);
	// Following any link in the drawer closes it.
	afterNavigate(() => (navOpen = false));

	provideShell({
		openNav: () => (navOpen = true),
		get orgName() {
			return sidebar.orgName;
		},
		get orgLogoUrl() {
			return sidebar.orgLogoUrl;
		}
	});

	const isCurrent = (href: string) =>
		href === '/'
			? sidebar.currentPath === '/'
			: sidebar.currentPath === href || sidebar.currentPath.startsWith(`${href}/`);
</script>

<a class="skip" href="#main">{shell.skipToContent}</a>

<div class="shell">
	<div class="side">
		<Sidebar {...sidebar} {items} {canCreateProject} />
	</div>

	<Dialog.Root bind:open={navOpen}>
		<Dialog.Portal>
			<Dialog.Overlay>
				{#snippet child({ props })}
					<div {...props} class="overlay"></div>
				{/snippet}
			</Dialog.Overlay>
			<Dialog.Content aria-label={shell.navTitle}>
				{#snippet child({ props })}
					<div {...props} class="drawer">
						<Sidebar {...sidebar} {items} {canCreateProject} />
					</div>
				{/snippet}
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>

	<main id="main" class="main" tabindex="-1" aria-busy={navigating.to ? 'true' : undefined}>
		{#if navigating.to}<div class="progress" aria-hidden="true"></div>{/if}
		{@render children()}
	</main>

	{#if tabs.length}
		<nav class="tabs" aria-label={shell.navTitle} {@attach preloadInView}>
			{#each tabs as tab (tab.href)}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- registered in #lib/nav -->
				<a
					class="tab"
					href={tab.tabHref ?? tab.href}
					aria-current={isCurrent(tab.href) || (tab.tabHref && isCurrent(tab.tabHref))
						? 'page'
						: undefined}
					aria-label={tab.label}
				>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					<span class="tab-icon">
						{#if tab.icon}<Icon name={tab.icon} size={28} />{/if}
						{#if (sidebar.counts?.[tab.href] ?? 0) > 0}
							<span class="tab-dot" aria-hidden="true"></span>
						{/if}
					</span>
				</a>
			{/each}
			<AccountMenu
				userName={sidebar.userName}
				username={sidebar.username}
				avatarUrl={sidebar.userAvatarUrl}
				status={sidebar.status}
				items={account}
				variant="tab"
			/>
		</nav>
	{/if}
</div>

<style>
	/* Campsite's frame: a 240px sidebar beside the page from 1024px up; below that, the page
	   alone between its own 56px bar and a tab bar at the bottom. */
	.shell {
		display: grid;
		grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
		min-block-size: 100dvb;
		padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
		background-color: var(--hue-z0-bg);
		color: var(--hue-z0-fg);
	}

	.side {
		position: sticky;
		inset-block-start: 0;
		block-size: 100dvb;
	}

	.main {
		display: flex;
		flex-direction: column;
		min-inline-size: 0;
		outline: none;
	}

	/* A next page that takes a while: a line along the top of the page, held back so a quick
	   one never shows it. It takes no room of its own. */
	.progress {
		position: sticky;
		inset-block-start: 0;
		z-index: var(--z-sticky);
		flex: none;
		block-size: var(--border-w-thick);
		margin-block-end: calc(var(--border-w-thick) * -1);
		background-color: var(--hue-accent);
		animation: fade-in var(--motion-fast) var(--motion-ease-out) var(--motion-delay-progress) both;
	}

	.tabs {
		display: none;
	}

	/* Hidden until a keyboard user tabs to it. */
	.skip {
		position: fixed;
		inset: var(--gap-sm) auto auto var(--gap-sm);
		z-index: var(--z-toast);
		padding: var(--gap-sm) var(--gap-md);
		border-radius: var(--radius-control);
		background-color: var(--hue-z2-bg);
		color: var(--hue-z2-fg);
		box-shadow: var(--elevation-popover);
		opacity: 0;
		pointer-events: none;
	}

	.skip:focus-visible {
		opacity: 1;
	}

	@media (max-width: 63.99rem) {
		.shell {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: 1fr auto;
		}

		.side {
			display: none;
		}

		.tabs {
			position: sticky;
			inset-block-end: 0;
			z-index: var(--z-sticky);
			display: grid;
			grid-auto-columns: 1fr;
			grid-auto-flow: column;
			gap: 0.375rem;
			padding: 0.375rem;
			padding-block-end: max(var(--gap-sm), calc(0.375rem + env(safe-area-inset-bottom)));
			border-block-start: var(--border-w-hairline) solid var(--hue-z0-border);
			background-color: var(--hue-z0-bg);
		}

		/* A detail page (a post, a note, a conversation) gives the whole screen to itself and
		   leads back with an arrow in its own bar. */
		.shell:has(:global(.page-header[data-detail])) .tabs {
			display: none;
		}
	}

	.tab {
		display: flex;
		align-items: center;
		justify-content: center;
		min-block-size: var(--tap-min);
		padding: 0.375rem var(--gap-md);
		border-radius: var(--radius-control);
		color: var(--hue-z0-muted);
	}

	.tab:hover,
	.tab[aria-current='page'] {
		background-color: light-dark(var(--hue-gray-100), var(--hue-gray-800));
		color: var(--hue-z0-fg);
	}

	.tab:active {
		background-color: var(--hue-pressed);
		color: var(--hue-z0-fg);
	}

	.tab-icon {
		position: relative;
		display: grid;
	}

	.tab-dot {
		position: absolute;
		inset-block-start: -1px;
		inset-inline-end: -3px;
		inline-size: 0.5rem;
		block-size: 0.5rem;
		border-radius: var(--radius-full);
		background-color: var(--hue-unread);
	}

	.overlay {
		position: fixed;
		inset: 0;
		z-index: var(--z-overlay);
		background-color: var(--hue-backdrop);
		animation: fade-in var(--motion-base) var(--motion-ease);
	}

	.drawer {
		position: fixed;
		inset-block: 0;
		inset-inline-start: 0;
		z-index: var(--z-modal);
		inline-size: min(var(--sidebar-w) + var(--gap-3xl), 85vi);
		box-shadow: var(--shadow-popover);
		animation: drawer-in 200ms var(--motion-ease-out);
	}

	@keyframes drawer-in {
		from {
			translate: -100% 0;
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
</style>
