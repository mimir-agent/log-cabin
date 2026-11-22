<script lang="ts">
	import { tick } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { MediaQuery } from 'svelte/reactivity';
	import { DropdownMenu } from 'bits-ui';
	import Summary from '#lib/components/ai/Summary.svelte';
	import RichText from '#lib/components/editor/RichText.svelte';
	import CommentForm from '#lib/components/posts/CommentForm.svelte';
	import CommentThread from '#lib/components/posts/CommentThread.svelte';
	import PostNotificationsSwitch from '#lib/components/posts/PostNotificationsSwitch.svelte';
	import AskFeedbackDialog from '#lib/components/posts/AskFeedbackDialog.svelte';
	import FeedbackRequests from '#lib/components/posts/FeedbackRequests.svelte';
	import RemindDialog from '#lib/components/posts/RemindDialog.svelte';
	import RemindItems from '#lib/components/posts/RemindItems.svelte';
	import RemindMe from '#lib/components/posts/RemindMe.svelte';
	import CanvasImage from '#lib/components/posts/CanvasImage.svelte';
	import PollView from '#lib/components/posts/PollView.svelte';
	import PersonHoverCard from '#lib/components/people/PersonHoverCard.svelte';
	import MoveItems from '#lib/components/posts/MoveItems.svelte';
	import MoveMenu from '#lib/components/posts/MoveMenu.svelte';
	import PinButton from '#lib/components/posts/PinButton.svelte';
	import PublicLink from '#lib/components/posts/PublicLink.svelte';
	import ResolveDialog from '#lib/components/posts/ResolveDialog.svelte';
	import Reactions from '#lib/components/posts/Reactions.svelte';
	import { submitTick } from '#lib/components/posts/tick.js';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Banner from '#lib/components/ui/Banner.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import Popover from '#lib/components/ui/Popover.svelte';
	import { attachmentIdOf, docText } from '#lib/editor/doc.js';
	import { subscribe } from '#lib/realtime.js';
	import { cursorHue } from '#lib/notes/live.js';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import { time } from '#lib/strings/time.js';
	import type { ActionData, PageData } from './$types';

	type Props = {
		data: PageData;
		form: ActionData;
		/** Shown in the inbox's detail pane: a Close button, and the way back leads there. */
		closeHref?: string;
	};
	const { data, form, closeHref }: Props = $props();
	const s = posts.post;
	const post = $derived(data.post);
	const canResolve = $derived(data.isAuthor || data.isAdmin);
	const uploadUrl = $derived(`/projects/${post.projectId}/attachments`);
	const canEdit = $derived(data.isAuthor && data.canWrite);
	let askingFeedback = $state(false);
	// Below 1024px the bar is back, the title, mark done and "…"; the rest are the menu's rows.
	const narrow = new MediaQuery('max-width: 63.99rem');
	let sharing = $state(false);
	let resolving = $state(false);
	let reminding = $state(false);
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
	const latest = $derived(data.versions.at(-1)!);
	const isLatest = $derived(latest.id === post.id);
	const v = posts.versions;

	// On a phone a thread's reply row hands its reply to the box at the bottom, as Campsite does.
	let replyingTo = $state<string | null>(null);
	const replyTarget = $derived(data.comments.find((c) => c.id === replyingTo));
	let composer = $state<HTMLElement>();
	async function replyFromBox(commentId: string) {
		replyingTo = replyingTo === commentId ? null : commentId;
		await tick();
		if (replyingTo) composer?.querySelector<HTMLElement>('.ProseMirror')?.focus();
	}

	const confirmDelete: SubmitFunction = ({ cancel }) => {
		if (!confirm(s.confirmDelete)) cancel();
	};

	// New comments, edits and reactions from other people arrive without a reload.
	$effect(() =>
		subscribe(`post:${post.id}`, (payload) => {
			if (payload.type !== 'denied' && payload.type !== 'resync') invalidateAll();
		})
	);
</script>

<svelte:head>
	<title>{post.title} · {core.appName}</title>
</svelte:head>

{#snippet canvasImage({ src, alt }: { src: string; alt: string })}
	{@const attachmentId = attachmentIdOf(src)}
	<CanvasImage
		{src}
		{alt}
		{attachmentId}
		pins={pinsOn(attachmentId)}
		canPin={data.canWrite}
		members={data.people}
		customEmoji={orgEmoji.custom}
		{uploadUrl}
		viewerHue={cursorHue(data.viewerId)}
	/>
{/snippet}

<PageHeader
	title={post.title}
	back={closeHref ?? resolve('/projects/[id]', { id: post.projectId })}
>
	{#snippet leading()}
		<nav class="crumb" aria-label={s.breadcrumb}>
			<span class="crumb-mark" aria-hidden="true"
				><Avatar name={post.project.name} size="xs" shape="square" /></span
			>
			<a href={resolve('/projects/[id]', { id: post.projectId })}>{post.project.name}</a>
			<span class="crumb-sep" aria-hidden="true">{s.crumbSeparator}</span>
		</nav>
	{/snippet}
	{#snippet actions()}
		{#if !narrow.current}
			{@render barActions()}
		{/if}
		{#if canEdit}
			<AskFeedbackDialog candidates={data.feedbackCandidates} bind:open={askingFeedback} />
		{/if}
		{#if canResolve && data.canWrite}
			<ResolveDialog bind:open={resolving} members={data.people} {uploadUrl} />
		{/if}
		{#if narrow.current || canEdit || canResolve}
			<Menu align="end">
				{#snippet trigger({ props })}
					<IconButton {...props} icon="dots-horizontal" label={core.actions.more} />
				{/snippet}
				{#if narrow.current}
					{@render phoneRows()}
				{/if}
				{@render ownRows()}
			</Menu>
		{/if}
		{#if closeHref}
			<IconButton href={closeHref} icon="close" label={core.actions.close} />
		{/if}
	{/snippet}
</PageHeader>

{#if narrow.current}
	<RemindDialog
		bind:open={reminding}
		action="/follow-ups?/set"
		fields={{ subjectType: 'post', subjectId: post.id }}
	/>
	{#if data.publicLink}
		<Dialog bind:open={sharing} title={posts.publicLink.label} size="sm">
			<PublicLink url={data.publicLink.url} />
		</Dialog>
	{/if}
{/if}

<!-- Wide screens keep these in the bar. A phone's bar has room for the back arrow, the title,
     "mark done" and "…", as Campsite's does, so they are rows of the "…" menu there. -->
{#snippet barActions()}
	{#if data.pin}
		<PinButton pin={data.pin} subjectType="post" subjectId={post.id} />
	{/if}
	{#if data.publicLink}
		<!-- Campsite shares from the titlebar: the public link lives in a popover, not the post. -->
		<Popover align="end" width="22rem" label={posts.publicLink.label}>
			{#snippet trigger({ props })}
				<Button {...props} variant="ghost">
					<Icon name="globe" />
					{posts.publicLink.share}
				</Button>
			{/snippet}
			<PublicLink url={data.publicLink.url} />
		</Popover>
	{/if}
	<RemindMe
		action="/follow-ups?/set"
		fields={{ subjectType: 'post', subjectId: post.id }}
		reminder={data.followUps[post.id]}
	/>
	{#if data.moveTargets}
		<MoveMenu targets={data.moveTargets} />
	{/if}
	{#if canResolve && post.resolvedAt}
		<form method="POST" action="?/unresolve" use:enhance>
			<Button type="submit" variant="ghost">
				<Icon name="rotate" />
				{s.unresolve}
			</Button>
		</form>
	{:else if canResolve && data.canWrite}
		<Button variant="ghost" onclick={() => (resolving = true)}>
			<Icon name="check-circle" />
			{s.resolve}
		</Button>
	{/if}
{/snippet}

{#snippet phoneRows()}
	{#if data.pin}
		<PinButton item pin={data.pin} subjectType="post" subjectId={post.id} />
	{/if}
	{#if data.publicLink}
		<DropdownMenu.Item onSelect={() => (sharing = true)}>
			<Icon name="globe" />
			{posts.publicLink.share}
		</DropdownMenu.Item>
	{/if}
	<DropdownMenu.Group>
		<DropdownMenu.GroupHeading>{posts.followUps.remindMe}</DropdownMenu.GroupHeading>
		<RemindItems
			action="/follow-ups?/set"
			fields={{ subjectType: 'post', subjectId: post.id }}
			reminder={data.followUps[post.id]}
			oncustom={() => (reminding = true)}
		/>
	</DropdownMenu.Group>
	{#if data.moveTargets}
		<MoveItems targets={data.moveTargets} />
	{/if}
	{#if canResolve && post.resolvedAt}
		<form method="POST" action="?/unresolve" use:enhance>
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<button {...props} type="submit">
						<Icon name="rotate" />
						{s.unresolve}
					</button>
				{/snippet}
			</DropdownMenu.Item>
		</form>
	{:else if canResolve && data.canWrite}
		<DropdownMenu.Item onSelect={() => (resolving = true)}>
			<Icon name="check-circle" />
			{s.resolve}
		</DropdownMenu.Item>
	{/if}
	{#if canEdit || canResolve}<DropdownMenu.Separator />{/if}
{/snippet}

{#snippet ownRows()}
	{#if canEdit}
		<DropdownMenu.Item onSelect={() => (askingFeedback = true)}>
			<Icon name="feedback-request" />
			{posts.feedback.ask}
		</DropdownMenu.Item>
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a {...props} href={resolve('/posts/[id]/edit', { id: post.id })}>
					<Icon name="pencil" />
					{s.edit}
				</a>
			{/snippet}
		</DropdownMenu.Item>
	{/if}
	{#if canEdit && isLatest}
		<form method="POST" action="?/newVersion" use:enhance>
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<button {...props} type="submit">
						<Icon name="post-plus" />
						{v.newVersion}
					</button>
				{/snippet}
			</DropdownMenu.Item>
		</form>
	{/if}
	{#if canResolve}
		{#if canEdit}<DropdownMenu.Separator />{/if}
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
{/snippet}

<div class="page" bind:this={column}>
	<article class="band">
		<div class="column post">
			{#if !isLatest}
				<Banner>
					{v.olderNotice(post.version)}
					{#snippet action()}
						<Button href={resolve('/posts/[id]', { id: latest.id })} size="sm"
							>{v.goToLatest}</Button
						>
					{/snippet}
				</Banner>
			{/if}
			{#each data.moves as move (move.at)}
				<p class="moved">
					{posts.move.line(move.by, move.from, move.to)}
					{s.separator}
					<time datetime={new Date(move.at).toISOString()}>{s.when(move.at, data.timeZone)}</time>
				</p>
			{/each}

			{#if post.resolvedAt}
				<p class="resolved" role="status">
					<Icon name="check-circle-filled" size={16} />
					{data.resolverName ? s.resolvedBy(data.resolverName) : posts.feed.resolved}
				</p>
				{#if post.resolvedBody}
					<div class="resolution">
						<RichText
							doc={post.resolvedBody}
							customEmoji={orgEmoji.custom}
							resources={data.resources}
						/>
					</div>
				{/if}
			{/if}

			<header class="byline">
				<Avatar name={post.authorName} src={post.authorAvatarUrl} size="sm" />
				<span class="author"><PersonHoverCard userId={post.authorId} name={post.authorName} /></span
				>
				<!-- Wide screens name the project in the titlebar; a phone's bar has no room. -->
				<a class="in" href={resolve('/projects/[id]', { id: post.projectId })}
					>{posts.feed.inProject(post.project.name)}</a
				>
				<time
					datetime={new Date(post.createdAt).toISOString()}
					title={time.long(post.createdAt, data.timeZone)}
					>{time.short(post.createdAt, data.timeZone)}</time
				>
				{#if post.editedAt}<span class="edited">{s.edited}</span>{/if}
				{#if data.versions.length > 1}
					<a class="versions" href={resolve('/posts/[id]/versions', { id: post.id })}
						>{v.label(post.version)} · {v.all(data.versions.length)}</a
					>
				{/if}
				{#if data.source}
					<!-- The message it was started from, for readers of that conversation. -->
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved on the server, with a #message anchor -->
					<a class="versions" href={data.source.href}>{s.fromMessage(data.source.name)}</a>
				{/if}
			</header>

			<h1 class="title">{post.title}</h1>

			{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}

			{#if data.feedbackAskingMe}
				{@const request = data.feedbackAskingMe}
				<Banner>
					{posts.feedback.askedYou(post.authorName)}
					{#snippet action()}
						<form method="POST" action="?/dismissFeedback" use:enhance>
							<input type="hidden" name="requestId" value={request.id} />
							<Button type="submit" variant="ghost" size="sm">{posts.feedback.dismiss}</Button>
						</form>
					{/snippet}
				</Banner>
			{/if}

			{#if data.summaries !== 'off'}
				<Summary
					summary={form?.summary}
					error={form?.summaryError}
					tooShort={data.summaries === 'tooShort'}
				/>
			{/if}

			<div class="body">
				<RichText
					post
					doc={post.body}
					customEmoji={orgEmoji.custom}
					image={canvasImage}
					tags
					resources={data.resources}
					ontick={data.canWrite
						? (index, checked) => submitTick('post', post.id, index, checked)
						: undefined}
				/>
			</div>

			{#if data.poll}<PollView poll={data.poll} canVote={data.canWrite} />{/if}
			<FeedbackRequests requests={data.feedback} canWithdraw={data.isAuthor} />

			<Reactions
				summaries={data.reactions[post.id] ?? []}
				subjectType="post"
				subjectId={post.id}
				canReact={data.canWrite}
				{orgEmoji}
				boundary={column}
			/>
		</div>
	</article>

	<section class="band comments" aria-labelledby="comments-heading">
		<div class="column">
			<div class="comments-heading">
				<h2 id="comments-heading">{posts.comments.title}</h2>
				<PostNotificationsSwitch subscribed={data.subscribed} />
			</div>
			{#each data.comments as comment (comment.id)}
				<CommentThread
					{comment}
					reactions={data.reactions}
					viewerId={data.viewerId}
					isAdmin={data.isAdmin}
					canWrite={data.canWrite}
					{canResolve}
					resolvedCommentId={post.resolvedCommentId}
					threadResolution={comment.resolvedAt === null
						? null
						: { at: comment.resolvedAt, byName: comment.resolvedByName }}
					members={data.people}
					{orgEmoji}
					boundary={column}
					{uploadUrl}
					followUps={data.followUps}
					resources={data.resources}
					onreply={replyFromBox}
					replying={replyingTo === comment.id}
				/>
			{:else}
				<p class="muted">{posts.comments.empty}</p>
			{/each}
		</div>
		<div class="composer" bind:this={composer}>
			<div class="column">
				{#if data.canWrite}
					{#if replyTarget}
						<div class="reply-context">
							<p class="reply-text">
								<span class="reply-who">{posts.comments.replyingTo(replyTarget.authorName)}</span>
								<span class="reply-preview">{docText(JSON.parse(replyTarget.body))}</span>
							</p>
							<IconButton
								icon="close"
								label={posts.comments.cancelReply}
								size="sm"
								onclick={() => (replyingTo = null)}
							/>
						</div>
					{/if}
					<CommentForm
						action="?/comment"
						replyTo={replyingTo ?? undefined}
						listed={data.comments.flatMap((c) => [c.id, ...c.replies.map((r) => r.id)])}
						members={data.people}
						customEmoji={orgEmoji.custom}
						{uploadUrl}
						placeholder={replyTarget ? posts.comments.replyPlaceholder : posts.comments.placeholder}
						submitLabel={replyTarget ? posts.comments.submitReply : posts.comments.submit}
						onsaved={() => (replyingTo = null)}
					/>
				{:else}
					<p class="muted">{posts.comments.readOnly}</p>
				{/if}
			</div>
		</div>
	</section>
</div>

<style>
	/* Campsite's post page: the post on the page's own white in a 756px column, then the
	   comments on a band one step back, with the comment box pinned to the bottom. */
	.page {
		display: flex;
		flex: 1;
		flex-direction: column;
	}

	.column {
		inline-size: 100%;
		max-inline-size: var(--measure-post);
		margin-inline: auto;
		padding-inline: var(--gap-lg);
	}

	.band.comments {
		display: flex;
		flex: 1;
		flex-direction: column;
		border-block-start: var(--border-w-hairline) solid var(--hue-z0-border);
		background-color: light-dark(var(--hue-gray-50), var(--hue-gray-950));
	}

	.post {
		display: flex;
		flex-direction: column;
		gap: var(--gap-md);
		padding-block: var(--gap-xl) var(--gap-lg);
	}

	@media (min-width: 48rem) {
		.post {
			padding-block-start: 2rem;
		}
	}

	@media (min-width: 64rem) {
		.post {
			padding-block-start: 2.5rem;
		}
	}

	@media (min-width: 80rem) {
		.post {
			padding-block-start: 3rem;
		}
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

	.crumb-mark {
		display: flex;
		flex: none;
	}

	.crumb a {
		overflow: hidden;
		color: inherit;
		text-decoration: none;
		text-overflow: ellipsis;
	}

	.crumb a:hover {
		text-decoration: underline;
	}

	.crumb-sep {
		color: var(--hue-text-quaternary);
		font-size: var(--type-body);
		font-weight: var(--fw-regular);
	}

	@media (max-width: 63.99rem) {
		.crumb {
			display: none;
		}
	}

	.byline {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.375rem;
		align-items: center;
		color: var(--hue-z0-muted);
		font-size: var(--type-prose);
		line-height: 1.5rem;
	}

	.byline :global(.avatar) {
		margin-inline-end: var(--gap-sm);
	}

	.author {
		color: var(--hue-z0-fg);
		font-weight: var(--fw-medium);
	}

	.in,
	.versions {
		color: inherit;
		text-decoration: none;
	}

	.in:hover,
	.versions:hover {
		color: var(--hue-z0-fg);
	}

	@media (min-width: 64rem) {
		.in {
			display: none;
		}
	}

	.title {
		margin: var(--gap-xs) 0 0;
		font-size: 1.375rem;
		font-weight: var(--fw-bold);
		line-height: 1.375;
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;
	}

	.resolved {
		display: flex;
		gap: 0.375rem;
		align-items: center;
		align-self: flex-start;
		margin: 0 0 var(--gap-sm);
		padding: var(--gap-xs) var(--gap-sm);
		border-radius: var(--radius-control);
		background-color: light-dark(
			var(--hue-green-100),
			color-mix(in srgb, var(--hue-green-500) 18%, transparent)
		);
		color: var(--hue-success);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
	}

	.resolution {
		margin: 0 0 var(--gap-md);
		font-size: var(--type-body);
	}

	.error {
		margin: 0;
		color: var(--hue-danger);
	}

	.comments-heading {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		block-size: var(--control-h-sm);
		margin: var(--gap-lg) 0 var(--gap-xs);
	}

	.comments-heading h2 {
		flex: 1;
		margin: 0;
		font-size: var(--type-prose);
		font-weight: var(--fw-semibold);
	}

	.muted {
		margin: var(--gap-md) 0;
		color: var(--hue-z0-muted);
	}

	.moved {
		margin: 0 0 var(--gap-sm);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}

	/* Campsite's reply context over the bottom box: who you're answering, a line of what they
	   said, and a way out. */
	.reply-context {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		margin-block-end: var(--gap-md);
		padding: var(--gap-sm) var(--gap-sm) var(--gap-sm) var(--gap-lg);
		border-radius: var(--radius-full);
		background-color: light-dark(var(--hue-gray-100), var(--hue-gray-800));
	}

	.reply-text {
		display: grid;
		flex: 1;
		min-inline-size: 0;
		margin: 0;
	}

	.reply-who {
		color: var(--hue-text-secondary);
		font-size: var(--type-caption);
	}

	.reply-preview {
		overflow: hidden;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.composer {
		position: sticky;
		inset-block-end: 0;
		margin-block-start: auto;
		padding-block: var(--gap-md) calc(var(--gap-md) + env(safe-area-inset-bottom));
		background-color: inherit;
	}
</style>
