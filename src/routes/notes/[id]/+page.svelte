<script lang="ts">
	import { untrack } from 'svelte';
	import { browser } from '$app/env';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { DropdownMenu } from 'bits-ui';
	import Summary from '#lib/components/ai/Summary.svelte';
	import Editor from '#lib/components/editor/Editor.svelte';
	import {
		liveExtensions,
		type CommentPassages,
		type SelectedPassage
	} from '#lib/components/editor/live-extensions.js';
	import RichText from '#lib/components/editor/RichText.svelte';
	import NotePresence from '#lib/components/notes/NotePresence.svelte';
	import NotePublish from '#lib/components/notes/NotePublish.svelte';
	import NoteSharing from '#lib/components/notes/NoteSharing.svelte';
	import NoteTitle from '#lib/components/notes/NoteTitle.svelte';
	import NoteTimelineLine from '#lib/components/notes/NoteTimelineLine.svelte';
	import NoteViewers from '#lib/components/notes/NoteViewers.svelte';
	import CommentForm from '#lib/components/posts/CommentForm.svelte';
	import CanvasImage from '#lib/components/posts/CanvasImage.svelte';
	import CommentThread from '#lib/components/posts/CommentThread.svelte';
	import PinButton from '#lib/components/posts/PinButton.svelte';
	import Reactions from '#lib/components/posts/Reactions.svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import RemindDialog from '#lib/components/posts/RemindDialog.svelte';
	import RemindMenuItem from '#lib/components/posts/RemindMenuItem.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import PageIcon from '#lib/components/shell/PageIcon.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import { setFavorite } from '#lib/favorites.js';
	import Popover from '#lib/components/ui/Popover.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';
	import { NoteConnection, type LiveStatus } from '#lib/notes/connection.js';
	import { copiesNoteLink } from '#lib/notes/copy-link.js';
	import { cursorHue } from '#lib/notes/live.js';
	import { attachmentIdOf } from '#lib/editor/doc.js';
	import { subscribe } from '#lib/realtime.js';
	import { core } from '#lib/strings/core.js';
	import { notes } from '#lib/strings/notes.js';
	import { posts } from '#lib/strings/posts.js';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();
	const s = notes.note;
	const note = $derived(data.note);
	const title = $derived(note.title || notes.editor.titlePlaceholder);
	const isPrivate = $derived(
		data.sharing?.shares.length === 0 && note.projectPermission === 'none'
	);
	// A member's page, so the root layout has the org's emoji.
	const orgEmoji = $derived(data.orgEmoji!);
	// The content column, which reaction pickers stay inside.
	let column = $state<HTMLElement | null>(null);

	/** The comments pinned to an image, numbered per image in the order they were made. */
	const pinsOn = (attachmentId: string) =>
		data.comments
			.filter((c) => c.attachmentId === attachmentId)
			.map((c, i) => ({
				id: c.id,
				number: i + 1,
				x: c.x!,
				y: c.y!,
				authorName: c.authorName,
				hue: cursorHue(c.authorId)
			}));

	const confirmDelete: SubmitFunction = ({ cancel }) => {
		if (!confirm(s.confirmDelete)) cancel();
	};

	// Copy link and Copy ID, from the overflow menu, and the link from mod+shift+c too.
	const apple = browser && /Mac|iPhone|iPad/.test(navigator.userAgent);
	let noteBody = $state<HTMLElement | null>(null);
	async function copy(text: string, done: string) {
		await navigator.clipboard.writeText(text);
		toast(done);
	}
	const copyLink = () =>
		copy(new URL(resolve('/notes/[id]', { id: note.id }), page.url.origin).href, s.linkCopied);
	function onkeydown(event: KeyboardEvent) {
		if (!copiesNoteLink(event, noteBody, apple)) return;
		event.preventDefault();
		copyLink();
	}

	// New comments, reactions, renames and timeline lines from other people arrive without a reload.
	$effect(() =>
		subscribe(`note:${note.id}`, (payload) => {
			if (payload.type !== 'denied' && payload.type !== 'resync') invalidateAll();
		})
	);

	// The comment threads and the note's timeline in one list, in time order: a thread at its
	// first comment.
	const discussion = $derived(
		[
			...data.comments.map((comment) => ({
				key: `comment-${comment.id}`,
				at: comment.createdAt,
				comment,
				event: null
			})),
			...data.timeline.map((event) => ({
				key: `event-${event.id}`,
				at: event.createdAt,
				comment: null,
				event
			}))
		].sort((a, b) => a.at - b.at)
	);

	// Comments on words in the note: a Comment button under selected words opens a form for
	// them, and clicking words a comment was made on opens its thread. The button's place is
	// kept relative to the body, which scrolls with the words.
	let selected = $state<SelectedPassage | null>(null);
	/** The words the open form comments on, kept while the selection moves into the form. */
	let commenting = $state<SelectedPassage | null>(null);
	let formOpen = $state(false);
	let shareOpen = $state(false);
	const passageTools = $derived(commenting ?? selected);
	let opened = $state.raw<{ commentId: string; words: HTMLElement } | null>(null);
	let threadOpen = $state(false);
	let reminding = $state(false);
	const openedThread = $derived(
		opened && data.comments.find((comment) => comment.id === opened!.commentId)
	);
	const passages: CommentPassages = {
		onselect: (passage) => {
			const box = noteBody!.getBoundingClientRect();
			selected = passage && {
				...passage,
				top: passage.top - box.top,
				left: passage.left - box.left
			};
		},
		onopen: (commentId, words) => {
			opened = { commentId, words };
			threadOpen = true;
		}
	};
	function closeForm() {
		formOpen = false;
		commenting = null;
	}
	/** A phone's selection menu comments on the selected words with the form `.passage-tools` opens. */
	function commentOnSelection() {
		commenting = selected;
		formOpen = true;
	}

	// The body is edited live. Until the document arrives, the stored copy stands in for it.
	// A new connection only for another note, or when sharing changes what this person may do.
	let live = $state.raw<NoteConnection>();
	let status = $state<LiveStatus>('connecting');
	$effect(() => {
		const { id } = note;
		const { canWrite } = data.live;
		const user = untrack(() => data.live.user);
		const connection = new NoteConnection(id, canWrite, user, (next) => (status = next));
		live = connection;
		return () => connection.destroy();
	});
</script>

<svelte:head>
	<title>{title} · {core.appName}</title>
</svelte:head>

<svelte:window {onkeydown} />

<!-- An image open in the viewer, where anyone who may comment pins a comment to a point. -->
{#snippet canvasImage({ src, alt }: { src: string; alt: string })}
	{@const attachmentId = attachmentIdOf(src)}
	<CanvasImage
		{src}
		{alt}
		{attachmentId}
		pins={pinsOn(attachmentId)}
		canPin={data.canDiscuss}
		members={data.people}
		customEmoji={orgEmoji.custom}
		viewerHue={cursorHue(data.viewerId)}
	/>
{/snippet}

<!-- Campsite's note titlebar: where the note lives, then its title; on the right who's here,
     Share, the comment count and the overflow menu. Sharing lives in a popover, not the page. -->
<PageHeader {title} back={resolve('/notes')} phoneTitleHidden>
	{#snippet leading()}
		<nav class="crumb" aria-label={posts.post.breadcrumb}>
			{#if data.project}
				<span class="crumb-mark" aria-hidden="true"
					><Avatar name={data.project.name} size="xs" shape="square" /></span
				>
				<a href={resolve('/projects/[id]', { id: data.project.id })}>{data.project.name}</a>
				{#if data.project.private}
					<span class="crumb-lock"><Icon name="lock" size={16} /></span>
				{/if}
			{:else}
				<PageIcon tone="note" />
				<a href={resolve('/notes')}>{notes.list.title}</a>
			{/if}
			<span class="crumb-sep" aria-hidden="true">{posts.post.crumbSeparator}</span>
		</nav>
	{/snippet}
	{#snippet description()}
		{#if isPrivate}
			<span class="private" title={s.privateNotice}>
				<Icon name="lock" size={16} />
				<span class="u:visually-hidden">{s.privateNotice}</span>
			</span>
		{/if}
	{/snippet}
	{#snippet actions()}
		{#if live}<span class="faces"><NotePresence {live} {status} display="faces" /></span>{/if}
		<NoteViewers {...data.viewers} />
		{#if data.sharing}
			<Popover bind:open={shareOpen} align="end" width="22rem" label={notes.sharing.title}>
				{#snippet trigger({ props })}
					<!-- The label hides below 64rem, so the button names itself the same way. -->
					<Button {...props} variant="ghost" aria-label={notes.sharing.addPersonSubmit}>
						<Icon name="paper-airplane" />
						<span class="share-label">{notes.sharing.addPersonSubmit}</span>
					</Button>
				{/snippet}
				<NoteSharing
					{...data.sharing}
					viewerId={data.viewerId}
					noteId={note.id}
					noteTitle={title}
					onsharepost={() => (shareOpen = false)}
					project={{ id: note.projectId, permission: note.projectPermission }}
				/>
				<NotePublish url={data.publicUrl} allowed={data.publicLinks} />
			</Popover>
		{/if}
		<a class="count" href="#comments" aria-label={posts.comments.title}>
			<Icon name="chat-bubble" />
			{#if data.comments.length}<span>{data.comments.length}</span>{/if}
		</a>
		<Menu align="end">
			{#snippet trigger({ props })}
				<IconButton {...props} icon="dots-horizontal" label={core.actions.more} />
			{/snippet}
			<DropdownMenu.Item
				onSelect={() => setFavorite({ type: 'note', id: note.id }, !data.favorite)}
			>
				<Icon name={data.favorite ? 'star-filled' : 'star-outline'} />
				{data.favorite ? s.unfavorite : s.favorite}
			</DropdownMenu.Item>
			<RemindMenuItem
				action="/follow-ups?/set"
				fields={{ subjectType: 'note', subjectId: note.id }}
				reminder={data.followUps[note.id]}
				oncustom={() => (reminding = true)}
			/>
			{#if data.pin}
				<PinButton item pin={data.pin} subjectType="note" subjectId={note.id} />
			{/if}
			<DropdownMenu.Item onSelect={copyLink}>
				<Icon name="link" />
				{s.copyLink}
				<kbd data-menu-shortcut>{apple ? s.copyLinkKeys.apple : s.copyLinkKeys.other}</kbd>
			</DropdownMenu.Item>
			{#if data.publicUrl}
				{@const publicUrl = data.publicUrl}
				<DropdownMenu.Item onSelect={() => copy(publicUrl, s.publicLinkCopied)}>
					<Icon name="globe" />
					{s.copyPublicLink}
				</DropdownMenu.Item>
			{/if}
			<DropdownMenu.Item onSelect={() => copy(note.id, s.idCopied)}>
				<Icon name="copy" />
				{s.copyId}
			</DropdownMenu.Item>
			{#if data.canDelete}
				<DropdownMenu.Separator />
				<form method="POST" action="?/delete" use:enhance={confirmDelete}>
					<DropdownMenu.Item data-tone="danger">
						{#snippet child({ props })}
							<button {...props} type="submit">
								<Icon name="trash" />
								{s.delete}
							</button>
						{/snippet}
					</DropdownMenu.Item>
				</form>
			{/if}
		</Menu>
	{/snippet}
</PageHeader>

<RemindDialog
	bind:open={reminding}
	action="/follow-ups?/set"
	fields={{ subjectType: 'note', subjectId: note.id }}
/>

<div class="scroll" bind:this={column}>
	<article class="doc">
		{#if data.live.canWrite}
			<form method="POST" action="?/rename" class="rename" use:enhance>
				<NoteTitle
					name="title"
					value={note.title}
					label={notes.editor.title}
					placeholder={notes.editor.titlePlaceholder}
					onchange={(event) => event.currentTarget.form?.requestSubmit()}
				/>
			</form>
		{:else}
			<NoteTitle
				value={note.title}
				label={notes.editor.title}
				placeholder={notes.editor.titlePlaceholder}
				editable={false}
			/>
		{/if}

		{#if live}<NotePresence {live} {status} display="status" />{/if}
		{#if note.access === 'view'}<p class="muted">{s.readOnly}</p>{/if}
		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}

		{#if data.summaries !== 'off'}
			<Summary
				summary={form?.summary}
				error={form?.summaryError}
				tooShort={data.summaries === 'tooShort'}
			/>
		{/if}

		<div class="body" bind:this={noteBody} data-connecting={status === 'connecting' || undefined}>
			{#if live}
				{#key live}
					<div>
						<Editor
							name="body"
							checklists
							slash="document"
							gallery
							image={canvasImage}
							live={liveExtensions(live, passages)}
							note
							autofocus={page.url.searchParams.get('focus') === 'end'}
							placeholder={notes.editor.bodyPlaceholder}
							members={data.people}
							resources={data.resources}
							disabled={!data.live.canWrite || status === 'connecting'}
							uploadUrl={data.live.canWrite ? `/notes/${note.id}/attachments` : undefined}
							oncomment={data.canDiscuss ? commentOnSelection : undefined}
						/>
					</div>
				{/key}
			{/if}
			{#if status === 'connecting'}
				<div class="painted">
					<RichText doc={note.body} customEmoji={orgEmoji.custom} note resources={data.resources} />
				</div>
			{/if}
			{#if data.canDiscuss && passageTools && status !== 'connecting'}
				<div
					class="passage-tools"
					data-by-menu={data.live.canWrite || undefined}
					style:inset-block-start="{passageTools.top}px"
					style:inset-inline-start="{passageTools.left}px"
				>
					<Popover
						bind:open={formOpen}
						onOpenChange={(open) => (open ? (commenting = selected) : closeForm())}
						label={notes.passage.formLabel}
						width="22rem"
						boundary={column}
					>
						{#snippet trigger({ props })}
							<!-- Pressing it leaves the words selected, so it comments on them. -->
							<Button
								{...props}
								size="sm"
								onmousedown={(event: MouseEvent) => event.preventDefault()}
							>
								<Icon name="chat-bubble" />
								{notes.passage.comment}
							</Button>
						{/snippet}
						{#if commenting}
							<CommentForm
								action="?/comment"
								passage={commenting}
								listed={data.comments.map((c) => c.id)}
								members={data.people}
								customEmoji={orgEmoji.custom}
								placeholder={notes.passage.placeholder}
								submitLabel={posts.comments.submit}
								onsaved={closeForm}
							/>
						{/if}
					</Popover>
				</div>
			{/if}
		</div>

		<Popover
			bind:open={threadOpen}
			anchor={opened?.words}
			label={notes.passage.threadLabel}
			width="24rem"
			boundary={column}
		>
			{#if openedThread}
				<CommentThread
					comment={openedThread}
					reactions={data.reactions}
					viewerId={data.viewerId}
					isAdmin={data.isAdmin || data.isAuthor}
					canWrite={data.canDiscuss}
					canResolve={false}
					resolvedCommentId={null}
					threadResolution={openedThread.resolvedAt === null
						? null
						: { at: openedThread.resolvedAt, byName: openedThread.resolvedByName }}
					members={data.people}
					{orgEmoji}
					resources={data.resources}
					boundary={column}
					linkable={false}
				/>
				<a class="jump" href="#comment-{openedThread.id}" onclick={() => (threadOpen = false)}>
					{notes.passage.jump}
				</a>
			{:else}
				<p class="muted">{notes.passage.missing}</p>
			{/if}
		</Popover>

		<Reactions
			summaries={data.reactions[note.id] ?? []}
			subjectType="note"
			subjectId={note.id}
			canReact={data.canDiscuss}
			{orgEmoji}
			boundary={column}
		/>
	</article>

	<section class="comments" id="comments" aria-labelledby="comments-title">
		<div class="comments-column">
			<h2 id="comments-title" class="comments-title">{posts.comments.title}</h2>
			{#each discussion as item (item.key)}
				{#if item.comment}
					{@const comment = item.comment}
					<CommentThread
						{comment}
						quiet
						reactions={data.reactions}
						viewerId={data.viewerId}
						isAdmin={data.isAdmin || data.isAuthor}
						canWrite={data.canDiscuss}
						canResolve={false}
						resolvedCommentId={null}
						threadResolution={comment.resolvedAt === null
							? null
							: { at: comment.resolvedAt, byName: comment.resolvedByName }}
						members={data.people}
						{orgEmoji}
						resources={data.resources}
						boundary={column}
					/>
				{:else}
					<NoteTimelineLine event={item.event} />
				{/if}
			{/each}
			{#if !data.comments.length}<p class="muted">{posts.comments.empty}</p>{/if}
			{#if data.canDiscuss}
				<CommentForm
					action="?/comment"
					listed={data.comments.map((c) => c.id)}
					members={data.people}
					customEmoji={orgEmoji.custom}
					placeholder={posts.comments.placeholder}
					submitLabel={posts.comments.submit}
				/>
			{:else}
				<p class="muted">{posts.comments.readOnly}</p>
			{/if}
		</div>
	</section>
</div>

<style>
	/* Campsite's note page: a 44rem document column, the top padding growing with the
	   viewport (20 → 80px), a 32–40px bold title that is the field itself, and the body as
	   prose with no box around it. Comments sit below in the secondary band, like a post's. */
	.scroll {
		display: flex;
		flex: 1;
		flex-direction: column;
	}

	.doc {
		display: flex;
		flex-direction: column;
		gap: var(--gap-lg);
		inline-size: 100%;
		max-inline-size: calc(var(--page-doc) + 2 * var(--gap-lg));
		margin-inline: auto;
		padding: 1.25rem var(--gap-lg) var(--gap-3xl);
		container-type: inline-size;
	}

	/* The title, the people line and the summary sit on the text's column, 40rem as the line is
	   at 16px (an em here would follow each one's own type size); the body is the page's width so
	   its wide blocks can use it. */
	.doc > :global(:not(.body)) {
		inline-size: 100%;
		max-inline-size: 40rem;
		margin-inline: auto;
	}

	@media (min-width: 48rem) {
		.doc {
			padding-block-start: 2.5rem;
		}
	}

	@media (min-width: 64rem) {
		.doc {
			padding-block-start: 3rem;
		}
	}

	@media (min-width: 80rem) {
		.doc {
			padding-block-start: 4rem;
		}
	}

	@media (min-width: 96rem) {
		.doc {
			padding-block-start: 5rem;
		}
	}

	/* The document's editor: no box, no inset, the tools a quiet sticky row above the text. */
	/* The Comment button sits under the selected words' last line. */
	.body {
		position: relative;
	}

	.passage-tools {
		position: absolute;
		z-index: 1;
		margin-block-start: var(--gap-xs);
	}

	/* On a touch screen the system's selection handle hangs just under the words. */
	@media (pointer: coarse) {
		.passage-tools {
			margin-block-start: var(--gap-md);
		}
	}

	/* On a phone, an editable note's selection menu has the Comment button; this one only
	   stays laid out, so the form it opens has its place under the words. */
	@media (max-width: 39.99rem) {
		.passage-tools[data-by-menu] {
			visibility: hidden;
		}
	}

	.jump {
		display: inline-block;
		margin-block-start: var(--gap-sm);
		color: var(--hue-z2-muted);
		font-size: var(--type-caption);
	}

	.body :global(.editor) {
		border: 0;
		background: none;
	}

	.body :global(.editor .toolbar:not(.bubble)) {
		position: sticky;
		inset-block-start: var(--header-h);
		z-index: 1;
		max-inline-size: 40rem;
		margin-inline: auto;
		padding: var(--gap-xs) 0;
		border-block-end: 0;
		background-color: var(--hue-z0-bg);
	}

	/* The first line keeps a label's height clear under the sticky tools, so the name over
	   someone's caret there isn't hidden behind them. */
	.body :global(.editor .content) {
		min-block-size: 12rem;
		padding: var(--gap-lg) 0 0;
	}

	/* Until the editor connects, its tools show above the text as read, which sits where the
	   editor's text will, so nothing moves when it takes over. */
	.body[data-connecting] :global(.editor .content) {
		display: none;
	}

	.painted {
		padding: var(--gap-lg) 0 0;
	}

	.comments {
		flex: 1;
		border-block-start: var(--border-w-hairline) solid var(--hue-z0-border);
	}

	.comments-column {
		display: flex;
		flex-direction: column;
		gap: var(--gap-md);
		inline-size: 100%;
		max-inline-size: calc(40rem + 2 * var(--gap-lg));
		margin-inline: auto;
		padding: var(--gap-lg) var(--gap-lg) var(--gap-3xl);
	}

	.comments-title {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: var(--fw-semibold);
		line-height: var(--control-h-sm);
	}

	.crumb {
		display: flex;
		flex: none;
		gap: 0.375rem;
		align-items: center;
		max-inline-size: 32ch;
		/* The header puts 12px before the title; the separator wants 6px on both sides. */
		margin-inline-end: calc(0.375rem - var(--gap-md));
		font-size: 0.9375rem;
		font-weight: var(--fw-medium);
		white-space: nowrap;
	}

	.crumb a {
		overflow: hidden;
		color: inherit;
		text-decoration: none;
		text-overflow: ellipsis;
	}

	.crumb-mark {
		display: flex;
		flex: none;
	}

	.crumb-lock {
		display: inline-flex;
		color: var(--hue-z0-muted);
	}

	.crumb a:hover {
		text-decoration: underline;
	}

	.crumb-sep {
		color: var(--hue-text-quaternary);
		font-size: var(--type-body);
		font-weight: var(--fw-regular);
	}

	.private {
		display: inline-flex;
		color: var(--hue-z0-muted);
		translate: 0 0.1875rem;
	}

	.count {
		display: inline-flex;
		gap: var(--gap-xs);
		align-items: center;
		block-size: var(--control-h-sm);
		min-inline-size: var(--control-h-sm);
		justify-content: center;
		padding-inline: 0.375rem;
		border-radius: var(--radius-control);
		color: var(--hue-z0-fg);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		text-decoration: none;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	.count:hover {
		background-color: var(--hue-hover);
	}

	@media (pointer: coarse) {
		.count {
			min-block-size: var(--tap-min);
		}
	}

	@media (max-width: 63.99rem) {
		.crumb,
		.faces,
		.share-label {
			display: none;
		}
	}

	.error {
		color: var(--hue-danger);
	}

	.muted {
		margin: 0;
		color: var(--hue-z0-muted);
	}
</style>
