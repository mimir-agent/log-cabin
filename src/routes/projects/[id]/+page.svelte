<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { MediaQuery } from 'svelte/reactivity';
	import { DropdownMenu } from 'bits-ui';
	import CallsPanel from '#lib/components/calls/CallsPanel.svelte';
	import ComposerRow from '#lib/components/posts/ComposerRow.svelte';
	import Feed from '#lib/components/posts/Feed.svelte';
	import FeedPage from '#lib/components/posts/FeedPage.svelte';
	import CroppingImageInput from '#lib/components/images/CroppingImageInput.svelte';
	import ProjectPins from '#lib/components/posts/ProjectPins.svelte';
	import ProjectBookmarks from '#lib/components/posts/ProjectBookmarks.svelte';
	import EditProjectDialog from '#lib/components/posts/EditProjectDialog.svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import ChannelMarks from '#lib/components/shell/ChannelMarks.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import SubTabs from '#lib/components/shell/SubTabs.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import { optimistic } from '#lib/forms/submit.js';
	import { subscribe } from '#lib/realtime.js';
	import { calls } from '#lib/strings/calls.js';
	import { chat } from '#lib/strings/chat.js';
	import { core } from '#lib/strings/core.js';
	import { notes } from '#lib/strings/notes.js';
	import { people } from '#lib/strings/people.js';
	import { posts } from '#lib/strings/posts.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = posts.projects;
	const project = $derived(data.project);
	let coverInput: CroppingImageInput | undefined = $state();
	let coverPreview = $state<string | null>(null);
	let editing = $state(false);

	// The star turns the moment it's pressed; the server's answer replaces it.
	let starred = $state.raw<{ projectId: string; on: boolean } | null>(null);
	const isFavorite = $derived(starred?.projectId === project.id ? starred.on : project.isFavorite);
	const star = optimistic(() => {
		const next = { projectId: project.id, on: !isFavorite };
		starred = next;
		return () => {
			if (starred === next) starred = null;
		};
	});

	// Below 1024px the star leaves the bar and is the menu's first item.
	const narrow = new MediaQuery('max-width: 63.99rem');

	// A call starting or ending here shows up without a reload.
	const callsOn = $derived(!!data.calls);
	$effect(() => {
		if (!callsOn) return;
		return subscribe(`project:${project.id}`, (payload) => {
			if (payload.type === 'call' || payload.type === 'resync') invalidate('calls:place');
		});
	});
</script>

<svelte:head>
	<title>{project.name} · {core.appName}</title>
</svelte:head>

<!-- Campsite's project titlebar: the project's mark and name, a lock when it's private, the
     favourite star beside the name; a call button and one "…" menu on the right. Posting starts
     from the composer row in the page, so the bar has no New post button. Below 1024px it is
     Campsite's phone bar: back, the name with its marks, call, "…"; the star moves into the menu. -->
<PageHeader title={project.name} parent={resolve('/projects')}>
	{#snippet leading()}
		<span class="mark" aria-hidden="true"
			><Avatar name={project.name} accessory={project.accessory} size="xs" shape="square" /></span
		>
	{/snippet}
	{#snippet description()}
		<ChannelMarks private={project.private} archived={!!project.archivedAt} />
		{project.description ?? ''}
	{/snippet}
	{#snippet marks()}
		<ChannelMarks private={project.private} archived={!!project.archivedAt} />
	{/snippet}
	{#snippet tools()}
		<form
			class="star"
			method="POST"
			action={isFavorite ? '?/unfavorite' : '?/favorite'}
			use:enhance={star}
		>
			<IconButton
				type="submit"
				icon={isFavorite ? 'star-filled' : 'star-outline'}
				label={isFavorite ? s.unfavorite : s.favorite}
				aria-pressed={isFavorite}
				quiet={!isFavorite}
			/>
		</form>
	{/snippet}
	{#snippet actions()}
		{#if data.calls && !data.calls.live}
			<form method="POST" action="?/startCall">
				<IconButton type="submit" icon="video-camera" label={calls.place.start} />
			</form>
		{/if}
		<Menu align="end">
			{#snippet trigger({ props })}
				<IconButton {...props} icon="dots-horizontal" label={core.actions.more} />
			{/snippet}
			{#if narrow.current}
				{@render formItem(
					isFavorite ? '?/unfavorite' : '?/favorite',
					isFavorite ? 'star-filled' : 'star-outline',
					isFavorite ? s.unfavorite : s.favorite,
					star
				)}
			{/if}
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<a {...props} href={resolve('/projects/[id]/people', { id: project.id })}>
						<Icon name="users" />
						{s.people}
					</a>
				{/snippet}
			</DropdownMenu.Item>
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<a {...props} href={resolve('/projects/[id]/docs', { id: project.id })}>
						<Icon name="note" />
						{notes.docs.nav}
					</a>
				{/snippet}
			</DropdownMenu.Item>
			{#if data.calls}
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href={resolve('/projects/[id]/calls', { id: project.id })}>
							<Icon name="video" />
							{calls.index.nav}
						</a>
					{/snippet}
				</DropdownMenu.Item>
			{/if}
			{#if data.canJoin || project.isMember || data.canUpdate || data.canManage}
				<DropdownMenu.Separator />
			{/if}
			{#if data.canJoin}
				{@render formItem('?/join', 'plus-circle', s.join)}
			{/if}
			{#if project.isMember}
				{@render formItem('?/leave', 'log-out', s.leave)}
			{/if}
			{#if data.canUpdate}
				<DropdownMenu.Item onSelect={() => (editing = true)}>
					<Icon name="pencil" />
					{posts.channelSettings.menuEdit}
				</DropdownMenu.Item>
			{/if}
			{#if data.canManage}
				<DropdownMenu.Item onSelect={() => coverInput?.pick()}>
					<Icon name="photo" />
					{data.coverUrl ? people.projectCover.change : people.projectCover.add}
				</DropdownMenu.Item>
				{#if project.archivedAt}
					{@render formItem('?/unarchive', 'inbox-unarchive', s.unarchive)}
				{:else}
					{@render formItem('?/archive', 'archive', s.archive)}
				{/if}
			{/if}
		</Menu>
	{/snippet}
</PageHeader>

{#if data.chatThreadId}
	<SubTabs
		label={chat.channel.tabsLabel}
		tabs={[
			{
				href: resolve('/projects/[id]', { id: project.id }),
				label: chat.channel.posts,
				current: true
			},
			{
				href: resolve('/chat/[id]', { id: data.chatThreadId }),
				label: chat.channel.chat,
				current: false
			}
		]}
	/>
{/if}

{#snippet formItem(
	action: string,
	icon: 'plus-circle' | 'log-out' | 'archive' | 'inbox-unarchive' | 'star-filled' | 'star-outline',
	label: string,
	submit?: SubmitFunction
)}
	<form method="POST" {action} use:enhance={submit}>
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<button {...props} type="submit">
					<Icon name={icon} />
					{label}
				</button>
			{/snippet}
		</DropdownMenu.Item>
	</form>
{/snippet}

<FeedPage>
	{#if coverPreview ?? data.coverUrl}
		<img class="cover" src={coverPreview ?? data.coverUrl} alt="" />
	{/if}
	{#if data.canUpdate}
		<EditProjectDialog bind:open={editing} {project} error={form?.settingsError} />
	{/if}
	{#if data.canManage}
		<!-- The project menu opens the picker; a crop saves at once. -->
		<form
			class="cover-form"
			method="POST"
			action={resolve('/projects/[id]/cover', { id: project.id })}
			enctype="multipart/form-data"
		>
			<CroppingImageInput
				bind:this={coverInput}
				name="cover"
				shape="cover"
				label={people.projectCover.label}
				onpreview={(url) => (coverPreview = url)}
				oncrop={(field) => field.form?.requestSubmit()}
			/>
		</form>
	{/if}
	{#if project.archivedAt}
		<p class="notice" role="status">{s.archivedNotice}</p>
	{/if}
	{#if data.pins.length > 0}
		<ProjectPins pins={data.pins} canWrite={data.canWrite} />
	{/if}
	{#if data.bookmarks.length > 0 || data.canWrite}
		<ProjectBookmarks
			bookmarks={data.bookmarks}
			canWrite={data.canWrite}
			error={form?.bookmarkError}
			editError={form?.bookmarkEditError}
		/>
	{/if}
	{#if data.calls}
		<CallsPanel live={data.calls.live} recent={data.calls.recent} />
	{/if}
	{#if data.canWrite && data.user}
		<ComposerRow href={resolve('/projects/[id]/new', { id: project.id })} user={data.user} />
	{/if}
	<Feed items={data.feed.items} next={data.feed.next} showProject={false} />
</FeedPage>

<style>
	.cover {
		display: block;
		inline-size: 100%;
		aspect-ratio: 3;
		object-fit: cover;
		border-radius: var(--radius-surface);
	}

	/* The form shows nothing itself, so it takes no place in the feed's gaps. */
	.cover-form {
		display: contents;
	}

	/* Campsite puts 6px between a breadcrumb's icon and its label; the bar's gap is 12. */
	.mark {
		display: flex;
		flex: none;
		margin-inline-end: -0.375rem;
	}

	/* Out of the title's baseline row, so a 30px button doesn't push the 15px title down. */
	.star {
		display: flex;
		align-self: center;
		margin-block: -0.25rem;
	}

	/* Campsite's favourite star is the one bit of colour in its titlebar. */
	.star :global([aria-pressed='true']) {
		color: light-dark(var(--hue-amber-400), var(--hue-amber-300));
	}

	.notice {
		margin: 0;
		padding: var(--gap-sm) var(--gap-md);
		border-radius: var(--radius-control);
		background-color: var(--hue-z1-bg);
		color: var(--hue-z1-fg);
		font-size: var(--type-body);
	}
</style>
