<script lang="ts">
	import '../app.css';
	import '#lib/notifications-nav.js';
	import '#lib/posts-nav.js';
	import '#lib/notes-nav.js';
	import '#lib/search-nav.js';
	import QuickSwitcher from '#lib/components/search/QuickSwitcher.svelte';
	import KeyboardShortcuts from '#lib/components/shell/KeyboardShortcuts.svelte';
	import IncomingCall from '#lib/components/calls/IncomingCall.svelte';
	import '#lib/chat-nav.js';
	import '#lib/calls-nav.js';
	// Listens from the first page on: the install prompt fires once, early, on whichever page.
	import '#lib/install-prompt.svelte.js';
	import mark from '#lib/assets/mark.svg';
	import { pageBackground } from '#lib/pwa.js';
	import { goto, invalidate, invalidateAll, pushState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import { showInTab, type NewNotification } from '#lib/in-tab-notification.js';
	import { subscribe } from '#lib/realtime.js';
	import { trackKeyboard } from '#lib/editor/keyboard.js';
	import { zoneCookie, zoneToFollow } from '#lib/time-zone.js';
	import AppShell from '#lib/components/shell/AppShell.svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import SidebarLink from '#lib/components/shell/SidebarLink.svelte';
	import ThreadAvatar from '#lib/components/chat/ThreadAvatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { notes } from '#lib/strings/notes.js';
	import Toast from '#lib/components/ui/Toast.svelte';
	import { core } from '#lib/strings/core.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// The page being opened counts as current from the moment it's chosen, so the sidebar and
	// tab bar answer the tap before the next page has loaded.
	const currentPath = $derived((navigating.to?.url ?? page.url).pathname);

	// Starred projects first, then the rest of the projects this person belongs to.
	const sidebarProjects = $derived(
		data.sidebarProjects ? [...data.sidebarProjects.favorites, ...data.sidebarProjects.joined] : []
	);
	const newPostHref = $derived(
		sidebarProjects[0] ? `/projects/${sidebarProjects[0].id}/new` : undefined
	);
	const hasFavorites = $derived(
		!!data.sidebarProjects?.favorites.length ||
			!!data.favorites?.threads.length ||
			!!data.favorites?.notes.length
	);

	// Each load brings a fresh count; between loads the realtime socket, and the service
	// worker while push is on, relay newer ones.
	let unread = $derived(data.unread);
	$effect(() => {
		if (!('serviceWorker' in navigator)) return;
		const onMessage = (event: MessageEvent) => {
			if (event.data?.type === 'inbox.unread') unread = event.data.count;
		};
		navigator.serviceWorker.addEventListener('message', onMessage);
		return () => navigator.serviceWorker.removeEventListener('message', onMessage);
	});
	// The installed app's icon shows the inbox count too; signed out it is 0, which clears it.
	// Firefox has no app badge.
	$effect(() => {
		if ('setAppBadge' in navigator) navigator.setAppBadge(unread);
	});
	$effect(trackKeyboard);
	const userId = $derived(data.user?.id);

	// Opening a page reads what the inbox holds about it, whether it was opened from an inbox
	// row, a push notification or a link in an email: the page shows first, then this follows.
	// A page that was only preloaded is never shown, so it never gets here.
	$effect(() => {
		const about = data.about;
		if (!about?.unread) return;
		fetch('/inbox?/readAbout', {
			method: 'POST',
			headers: { 'x-sveltekit-action': 'true' },
			body: new URLSearchParams({ path: about.path })
		}).then((response) => {
			if (!response.ok) {
				throw new Error(
					`Reading the inbox items about ${about.path}: expected 200, got ${response.status}`
				);
			}
		});
	});

	// The server writes dates in the zone this browser last told it, so tell it this one, and
	// reload the page's data once if that changed what it wrote (the first visit, a trip). The
	// member's saved zone, which others see their local time in, follows the browser too.
	const serverZone = $derived(data.timeZone);
	const memberZone = $derived(data.memberZone);
	$effect(() => {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const follow = memberZone === null ? null : zoneToFollow(memberZone, serverZone, zone);
		if (zone === serverZone && follow === null) return;
		document.cookie = `${zoneCookie}=${zone}; path=/; max-age=31536000; samesite=lax`;
		const saved = follow
			? fetch('/settings/time-zone', {
					method: 'POST',
					body: JSON.stringify({ from: serverZone, to: follow })
				}).then((res) => {
					if (!res.ok)
						throw new Error(`Saving time zone ${follow}: expected 204, got ${res.status}`);
				})
			: Promise.resolve();
		// The cookie changed even when the save failed, so reload either way.
		saved.finally(() => invalidateAll());
	});
	$effect(() => {
		if (!userId) return;
		return subscribe(`user:${userId}`, (payload) => {
			if (payload.type === 'inbox.unread') unread = payload.count as number;
			if (payload.type === 'new-notification') {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- the server built the path
				showInTab(payload as unknown as NewNotification, (url) => goto(url));
			}
			if (payload.type === 'chat.threads') invalidate('chat:threads');
			if (payload.type === 'call.ring') invalidate('calls:ringing');
			// The socket was down for a while: reload the page from the database to catch up.
			if (payload.type === 'resync') invalidateAll();
		});
	});
	// New post opens Campsite's dialog over the page you're on. Every New post link points at
	// its project's /new address, so a reload or a copied link opens the same dialog, over that
	// project; a click here opens it in place instead, unless a modifier asks for a new tab or
	// window, or a download.
	function composeHere(event: MouseEvent) {
		const link = (event.target as Element).closest?.('a[href]');
		const at = link?.getAttribute('href')?.match(/^\/projects\/([^/?#]+)\/new$/);
		if (
			!at ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return;
		event.preventDefault();
		pushState(resolve('/projects/[id]/new', { id: at[1] }), { newPost: at[1] });
	}
	const composing = $derived(
		page.state.newPost ?? (page.route.id === '/projects/[id]/new' ? page.params.id : undefined)
	);
</script>

<svelte:head>
	<link rel="icon" href={mark} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
	<meta name="theme-color" media="(prefers-color-scheme: light)" content={pageBackground.light} />
	<meta name="theme-color" media="(prefers-color-scheme: dark)" content={pageBackground.dark} />
	<title>{core.appName}</title>
</svelte:head>

<!-- Safari on iOS draws :active on touch only when a touchstart listener exists, so pressed
     rows and buttons show under a finger too. -->
<svelte:body ontouchstart={() => {}} />
<svelte:document onclickcapture={composeHere} />

{#if data.user && data.member && !page.route.id?.startsWith('/p/') && !page.url.pathname.startsWith('/onboarding')}
	<AppShell
		orgName={data.orgName ?? core.appName}
		orgLogoUrl={data.orgLogoUrl}
		userName={data.user.name}
		userAvatarUrl={data.user.avatarUrl}
		role={data.member.role}
		{currentPath}
		counts={{ '/inbox': unread }}
		{newPostHref}
		favorites={hasFavorites ? favorites : undefined}
		projects={data.sidebarProjects?.joined.length ? projects : undefined}
	>
		{@render children()}
	</AppShell>
	<QuickSwitcher projects={sidebarProjects} people={data.people} recent={data.recent} />
	<KeyboardShortcuts canCreate={!!newPostHref} />
	<IncomingCall ringing={data.ringing} />
	<!-- Loaded when it opens: the composer brings the editor, which most pages never need. -->
	{#if composing}
		{#await import('#lib/components/posts/NewPostDialog.svelte') then { default: NewPostDialog }}
			<NewPostDialog projectId={composing} />
		{/await}
	{/if}
	<Toast />
{:else}
	{@render children()}
{/if}

{#snippet projectLink(project: { id: string; name: string; accessory: string | null })}
	<SidebarLink
		href="/projects/{project.id}"
		current={currentPath.startsWith(`/projects/${project.id}`)}
	>
		{#snippet leading()}<Avatar
				name={project.name}
				accessory={project.accessory}
				size="xs"
				shape="square"
			/>{/snippet}
		{project.name}
	</SidebarLink>
{/snippet}

{#snippet projects()}
	{#each data.sidebarProjects?.joined ?? [] as project (project.id)}
		{@render projectLink(project)}
	{/each}
{/snippet}

<!-- Campsite's Favorites: projects, then threads with their unread state, then notes. -->
{#snippet favorites()}
	{#each data.sidebarProjects?.favorites ?? [] as project (project.id)}
		{@render projectLink(project)}
	{/each}
	{#each data.favorites?.threads ?? [] as thread (thread.id)}
		<SidebarLink
			href="/chat/{thread.id}"
			current={currentPath === `/chat/${thread.id}`}
			unread={thread.unread}
		>
			{#snippet leading()}<ThreadAvatar
					faces={thread.faces}
					group={thread.group}
					src={thread.pictureUrl}
					size="xs"
				/>{/snippet}
			{thread.name}
		</SidebarLink>
	{/each}
	{#each data.favorites?.notes ?? [] as note (note.id)}
		<SidebarLink href="/notes/{note.id}" current={currentPath === `/notes/${note.id}`}>
			{#snippet leading()}<Icon name="note-filled" />{/snippet}
			{note.title || notes.editor.titlePlaceholder}
		</SidebarLink>
	{/each}
{/snippet}
