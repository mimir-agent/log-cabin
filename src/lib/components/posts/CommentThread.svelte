<script lang="ts">
	import { page } from '$app/state';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { DropdownMenu } from 'bits-ui';
	import RichText from '#lib/components/editor/RichText.svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import { core } from '#lib/strings/core.js';
	import type { DocNode, ResourceTitles } from '#lib/editor/doc.js';
	import type { OrgEmoji } from '#lib/emoji/picker.js';
	import { posts } from '#lib/strings/posts.js';
	import { time } from '#lib/strings/time.js';
	import CommentForm from './CommentForm.svelte';
	import Reactions, { shownReactions } from './Reactions.svelte';
	import RemindMe from './RemindMe.svelte';
	import { submitTick } from './tick.js';
	import PersonHoverCard from '#lib/components/people/PersonHoverCard.svelte';

	type Comment = {
		id: string;
		authorId: string;
		authorName: string;
		authorAvatarUrl?: string | null;
		body: string;
		createdAt: number;
		editedAt: number | null;
		/** Set on a comment pinned to an image in the post; its marker there is #pin-<id>. */
		attachmentId?: string | null;
	};

	type Props = {
		comment: Comment & { replies: Comment[] };
		reactions: Record<string, { emoji: string; count: number; names: string[]; mine: boolean }[]>;
		viewerId: string;
		isAdmin: boolean;
		canWrite: boolean;
		/** The post's author or an admin, who may resolve the post with a comment. */
		canResolve: boolean;
		resolvedCommentId: string | null;
		members: { id: string; name: string }[];
		orgEmoji: OrgEmoji;
		/** The page's content column, which the reaction picker stays inside. */
		boundary: Element | null;
		uploadUrl?: string;
		/** The viewer's reminders by comment id; without it comments offer no reminder (notes). */
		followUps?: Record<string, { id: string; showAt: number }>;
		/**
		 * Below 768px a thread's reply row hands the reply to the page's own box at the bottom,
		 * as Campsite does on a phone: called with this thread's id. Without it, the thread
		 * keeps its own reply box at every width.
		 */
		onreply?: (commentId: string) => void;
		/** The page's box is replying to this thread. */
		replying?: boolean;
		/**
		 * A thread resolved on its own, as a note's are (`?/resolveComment`, `?/unresolveComment`):
		 * when and by whom, or null while open. Without it the thread offers neither (posts).
		 */
		threadResolution?: { at: number; byName: string | null } | null;
		/**
		 * Its comments carry their `comment-<id>` ids, which links point at; off for a second
		 * copy of the thread on the page, such as a note's popover over the words it is on.
		 */
		linkable?: boolean;
		/** What this reader may see of the notes, posts and calls the comments mention. */
		resources?: ResourceTitles;
	};

	const {
		comment,
		reactions,
		viewerId,
		isAdmin,
		canWrite,
		canResolve,
		resolvedCommentId,
		members,
		orgEmoji,
		boundary,
		uploadUrl,
		followUps,
		onreply,
		replying = false,
		threadResolution,
		linkable = true,
		resources = {}
	}: Props = $props();
	const s = posts.comments;

	/** Whether a resolved thread is shown in full rather than as its one line. */
	let expanded = $state(false);

	let editing = $state<string | null>(null);
	const close = () => (editing = null);

	// Campsite mounts each thread's reply box only once it scrolls into view, so a long thread
	// list doesn't start an editor per card.
	let replyBox = $state(false);
	function whenSeen(node: HTMLElement) {
		const seen = new IntersectionObserver(([entry]) => {
			if (!entry.isIntersecting) return;
			replyBox = true;
			seen.disconnect();
		});
		seen.observe(node);
		return { destroy: () => seen.disconnect() };
	}

	const confirmDelete: SubmitFunction = ({ cancel }) => {
		if (!confirm(s.confirmDelete)) cancel();
	};
</script>

{#snippet item(c: Comment, isReply: boolean)}
	{@const doc = JSON.parse(c.body) as DocNode}
	{@const mine = c.authorId === viewerId}
	{@const shown = shownReactions(c.id, reactions[c.id] ?? [])}
	{@const resolvable = canWrite && !isReply && threadResolution === null}
	<div
		class="comment"
		id={linkable ? `comment-${c.id}` : undefined}
		data-reply={isReply || undefined}
		data-resolved={c.id === resolvedCommentId || undefined}
	>
		<!-- The author's name follows in text, so the avatar is decoration. -->
		<div class="avatar" aria-hidden="true">
			<Avatar name={c.authorName} src={c.authorAvatarUrl} size="sm" />
		</div>
		<div class="main">
			<div class="meta">
				<p class="byline">
					<span class="author"><PersonHoverCard userId={c.authorId} name={c.authorName} /></span>
					<time
						datetime={new Date(c.createdAt).toISOString()}
						title={time.long(c.createdAt, page.data.timeZone)}
						>{time.short(c.createdAt, page.data.timeZone)}</time
					>
					{#if c.editedAt}<span class="edited">{s.edited}</span>{/if}
					{#if c.attachmentId}
						<a class="on-image" href="#pin-{c.id}">{posts.canvas.onImage}</a>
					{/if}
				</p>
				<div class="hover-actions">
					{#if canWrite && !shown.length}
						<Reactions
							summaries={[]}
							subjectType="comment"
							subjectId={c.id}
							canReact
							addOnly
							{orgEmoji}
							{boundary}
						/>
					{/if}
					{#if followUps}
						<RemindMe
							action="/follow-ups?/set"
							fields={{ subjectType: 'comment', subjectId: c.id }}
							reminder={followUps[c.id]}
							variant="icon"
						/>
					{/if}
					{#if canWrite && canResolve && c.id !== resolvedCommentId}
						<form class="resolve-comment" method="POST" action="?/resolve" use:enhance>
							<input type="hidden" name="commentId" value={c.id} />
							<IconButton type="submit" icon="check-circle" label={posts.post.resolveWithComment} />
						</form>
					{/if}
					{#if mine || isAdmin || resolvable}
						<Menu align="end">
							{#snippet trigger({ props })}
								<IconButton {...props} icon="dots-horizontal" label={core.actions.more} />
							{/snippet}
							{#if resolvable}
								<form method="POST" action="?/resolveComment" use:enhance>
									<input type="hidden" name="commentId" value={c.id} />
									<DropdownMenu.Item>
										{#snippet child({ props })}
											<button {...props} type="submit">
												<Icon name="check-circle" />
												{s.resolveComment}
											</button>
										{/snippet}
									</DropdownMenu.Item>
								</form>
							{/if}
							{#if canWrite && mine}
								<DropdownMenu.Item onSelect={() => (editing = c.id)}>
									<Icon name="pencil" />
									{s.edit}
								</DropdownMenu.Item>
							{/if}
							{#if mine || isAdmin}
								<form method="POST" action="?/deleteComment" use:enhance={confirmDelete}>
									<input type="hidden" name="commentId" value={c.id} />
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
					{/if}
				</div>
			</div>
			{#if c.id === resolvedCommentId}
				<p class="marker">
					<Icon name="check" size={12} strokeWidth="2.5" />{posts.post.resolvedWith}
				</p>
			{/if}
			{#if editing === c.id}
				<CommentForm
					action="?/editComment"
					commentId={c.id}
					value={doc}
					{members}
					customEmoji={orgEmoji.custom}
					{uploadUrl}
					placeholder={s.placeholder}
					submitLabel={s.save}
					oncancel={close}
					onsaved={close}
				/>
			{:else}
				<div class="body">
					<RichText
						{doc}
						customEmoji={orgEmoji.custom}
						{resources}
						ontick={canWrite
							? (index, checked) => submitTick('comment', c.id, index, checked)
							: undefined}
					/>
				</div>
			{/if}
			{#if shown.length}
				<Reactions
					summaries={reactions[c.id] ?? []}
					subjectType="comment"
					subjectId={c.id}
					canReact={canWrite}
					size="sm"
					{orgEmoji}
					{boundary}
				/>
			{/if}
		</div>
	</div>
{/snippet}

<!-- Campsite's thread: one card, the comment and its replies as rows divided by hairlines,
     replies not indented. -->
<div class="thread" data-replying={replying || undefined}>
	{#if threadResolution}
		<div class="resolved">
			<Button variant="ghost" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
				<span class="done"><Icon name="check-circle" /></span>
				{s.resolvedThread(threadResolution.byName)}
				<time
					class="resolved-at"
					datetime={new Date(threadResolution.at).toISOString()}
					title={time.long(threadResolution.at, page.data.timeZone)}
					>{time.short(threadResolution.at, page.data.timeZone)}</time
				>
				<Icon name={expanded ? 'chevron-select-expand' : 'chevron-select'} />
			</Button>
			{#if expanded && canWrite}
				<form method="POST" action="?/unresolveComment" use:enhance>
					<input type="hidden" name="commentId" value={comment.id} />
					<Button type="submit" size="sm">{s.reopenComment}</Button>
				</form>
			{/if}
		</div>
	{/if}
	{#if !threadResolution || expanded}
		{@render item(comment, false)}
		{#each comment.replies as reply (reply.id)}
			{@render item(reply, true)}
		{/each}
	{/if}
	<!-- Campsite's reply box at the foot of every thread (§2.4). On a phone the thread shows a
	     row instead, which hands the reply to the page's box at the bottom. A resolved thread
	     folded to its one line shows neither. -->
	{#if canWrite && (!threadResolution || expanded)}
		<div class="reply-form" data-wide-only={onreply ? '' : undefined} use:whenSeen>
			{#if replyBox}
				<CommentForm
					action="?/comment"
					replyTo={comment.id}
					listed={comment.replies.map((r) => r.id)}
					{members}
					customEmoji={orgEmoji.custom}
					{uploadUrl}
					placeholder={s.replyPlaceholder}
					submitLabel={s.submitReply}
					inline
				/>
			{:else}
				{@render replyRow()}
			{/if}
		</div>
		{#if onreply}
			<button type="button" class="reply-row" onclick={() => onreply(comment.id)}>
				{@render replyRow(replying ? s.cancelReply : s.replyPlaceholder)}
			</button>
		{/if}
	{/if}
</div>

{#snippet replyRow(label = s.replyPlaceholder)}
	<span class="reply-prompt" data-cancel={label === s.cancelReply || undefined}>
		{#if page.data.user}
			<Avatar name={page.data.user.name} src={page.data.user.avatarUrl} size="sm" />
		{/if}
		{label}
	</span>
{/snippet}

<style>
	.thread {
		margin-block: var(--gap-md);
		overflow: hidden;
		border: var(--border-w-hairline) solid light-dark(var(--hue-z0-border), transparent);
		border-radius: var(--radius-surface);
		background-color: light-dark(var(--hue-white), var(--hue-gray-900));
		/* Light: a soft shadow under a hairline. Dark: no border, two inset highlights. */
		box-shadow:
			0 1px 2px 0 light-dark(rgb(0 0 0 / 0.05), transparent),
			inset 0 0.5px 0 light-dark(transparent, rgb(255 255 255 / 0.06)),
			inset 0 0 0.5px light-dark(transparent, rgb(255 255 255 / 0.1));
	}

	.comment {
		display: flex;
		gap: var(--gap-md);
		padding: var(--gap-md);
	}

	.comment + .comment,
	.resolved + .comment,
	.reply-form,
	.reply-row {
		border-block-start: var(--border-w-hairline) solid var(--hue-border-secondary);
	}

	/* A resolved thread folds to one quiet line, as Campsite's tombstone does. */
	.resolved {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		justify-content: space-between;
		padding: var(--gap-xs);
	}

	.done {
		display: inline-flex;
		color: var(--hue-success);
	}

	.resolved-at {
		color: var(--hue-z0-muted);
	}

	/* A comment is highlighted when a link targets it, such as a summary's citation. */
	.comment:target {
		background-color: var(--hue-accent-subtle);
	}

	.comment[data-resolved] {
		background-color: light-dark(
			color-mix(in srgb, var(--hue-green-100) 50%, transparent),
			color-mix(in srgb, var(--hue-green-500) 8%, transparent)
		);
	}

	.avatar {
		align-self: flex-start;
	}

	.main {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--gap-xs);
		min-inline-size: 0;
	}

	.meta {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-block-size: 1.5rem;
		margin-block: -0.1875rem -0.25rem;
	}

	.byline {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		gap: 0 0.375rem;
		align-items: baseline;
		min-inline-size: 0;
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: 1.25rem;
	}

	.author {
		color: var(--hue-z0-fg);
		font-weight: var(--fw-medium);
	}

	/* Campsite's hover actions: 30px plain icons that fade in with the pointer, stay while a
	   menu is open, and are always shown on touchscreens. */
	.hover-actions {
		display: flex;
		gap: 2px;
		margin-block: -0.25rem;
		margin-inline-end: -0.25rem;
		color: var(--hue-z0-muted);
		opacity: 0;
		transition: opacity var(--motion-fast) var(--motion-ease);
	}

	.comment:hover .hover-actions,
	.hover-actions:focus-within,
	.hover-actions:has([data-state='open']) {
		opacity: 1;
	}

	@media (hover: none) and (pointer: coarse) {
		.hover-actions {
			opacity: 1;
		}
	}

	/* Campsite keeps resolving with a comment to wide screens; on a narrow one the row's actions
	   stay to the ones you reach for while reading. */
	@media (max-width: 63.99rem) {
		.hover-actions .resolve-comment {
			display: none;
		}
	}

	.on-image {
		color: inherit;
	}

	.on-image:hover {
		color: var(--hue-z0-fg);
	}

	.hover-actions form {
		display: contents;
	}

	.marker {
		display: inline-flex;
		gap: var(--gap-xs);
		align-items: center;
		align-self: flex-start;
		margin: var(--gap-xs) 0;
		padding: 2px 0.375rem;
		border-radius: var(--radius-xs, 0.25rem);
		background-color: light-dark(
			var(--hue-green-100),
			color-mix(in srgb, var(--hue-green-500) 20%, transparent)
		);
		color: var(--hue-success);
		font-family: var(--ff-mono);
		font-size: 0.6875rem;
		font-weight: var(--fw-semibold);
		text-transform: uppercase;
	}

	.body {
		padding-block-end: var(--gap-xs);
	}

	/* The reply row before its box has loaded, and the phone's row: your avatar and Campsite's
	   15px quaternary prompt, where the box's own avatar and placeholder will be. */
	.reply-prompt {
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		padding: var(--gap-md);
		color: var(--hue-text-quaternary);
		font-size: var(--type-prose);
		line-height: var(--leading-ui);
	}

	.reply-prompt[data-cancel] {
		color: var(--hue-text-secondary);
		font-weight: var(--fw-semibold);
	}

	.reply-row {
		display: block;
		inline-size: 100%;
		padding: 0;
		border-inline: 0;
		border-block-end: 0;
		background: none;
		text-align: start;
		cursor: pointer;
	}

	/* Replying from the page's box: the thread it answers stands out, as in Campsite. */
	.thread[data-replying] .comment {
		background-color: light-dark(var(--hue-gray-100), var(--hue-gray-800));
	}

	@media (max-width: 47.99rem) {
		.reply-form[data-wide-only] {
			display: none;
		}
	}

	@media (min-width: 48rem) {
		.reply-row {
			display: none;
		}
	}
</style>
