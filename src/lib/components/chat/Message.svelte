<script lang="ts" module>
	/** Where a message sits in a run from one person: it sets which corners stay round. */
	export type Position = 'first' | 'middle' | 'last' | 'only';
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { DropdownMenu } from 'bits-ui';
	import { MediaQuery } from 'svelte/reactivity';
	import RichText from '#lib/components/editor/RichText.svelte';
	import Emoji from '#lib/components/posts/Emoji.svelte';
	import Reactions, { shownReactions } from '#lib/components/posts/Reactions.svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';
	import { docFiles, docText, type DocNode, type ResourceTitles } from '#lib/editor/doc.js';
	import { quickReactions, savedPickCounts, type OrgEmoji } from '#lib/emoji/picker.js';
	import { chat } from '#lib/strings/chat.js';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import { time } from '#lib/strings/time.js';
	import DeleteAttachmentsDialog from './DeleteAttachmentsDialog.svelte';
	import MessageFiles from './MessageFiles.svelte';
	import MessageForm from './MessageForm.svelte';
	import { replyLabel } from './reply-label.js';

	type Props = {
		message: {
			id: string;
			authorId: string;
			authorName: string;
			body: DocNode | null;
			createdAt: number;
			editedAt: number | null;
			replyTo: { authorId: string; authorName: string; text: string | null } | null;
			reactions: { emoji: string; count: number; names: string[]; mine: boolean }[];
		};
		viewerId: string;
		/** An admin may edit or delete anyone's message. */
		admin?: boolean;
		members: { id: string; name: string }[];
		orgEmoji: OrgEmoji;
		/** The titles and pages of the mentioned posts, notes and calls this reader may open. */
		resources: ResourceTitles;
		/** The page's content column, which the reaction picker stays inside. */
		boundary: Element | null;
		uploadUrl: string;
		onreply: () => void;
		/** Start a post… from this message; left out where there's no project to post in. */
		onpost?: () => void;
		position?: Position;
		/** The sender's name above the run, in group threads. */
		showName?: boolean;
		/** The sender's face beside the run's last bubble, in group threads. */
		showAvatar?: boolean;
		/** Group threads keep a column for faces so runs line up. */
		group?: boolean;
		/** A message of yours the server hasn't confirmed: no actions until it has. */
		status?: 'sending' | 'failed';
		/** Sends a failed message again. */
		onretry?: () => void;
		/** Editing the message in place; the page sets it to edit your last message on ArrowUp. */
		editing?: boolean;
	};

	let {
		message,
		viewerId,
		admin = false,
		members,
		orgEmoji,
		resources,
		boundary,
		uploadUrl,
		onreply,
		onpost,
		position = 'only',
		showName = false,
		showAvatar = false,
		group = false,
		status,
		onretry,
		editing = $bindable(false)
	}: Props = $props();
	const s = chat.thread;
	const mine = $derived(message.authorId === viewerId);
	const files = $derived(message.body ? docFiles(message.body) : []);
	// Campsite's files sit beside the words as cards, not in the bubble.
	const isFile = (node: DocNode) => node.type === 'image' || node.type === 'attachment';
	const fileNodes = $derived((message.body?.content ?? []).filter(isFile));
	const words = $derived.by(() => {
		if (!message.body) return null;
		const doc = {
			...message.body,
			content: (message.body.content ?? []).filter((n) => !isFile(n))
		};
		return docText(doc) ? doc : null;
	});
	let deletingFiles = $state(false);

	// Campsite's long press (Bubble useLongPress): on a touch screen, holding a message opens
	// its menu as a sheet, with the quick reactions on top.
	const touch = new MediaQuery('(hover: none) and (pointer: coarse)');
	let menuOpen = $state(false);
	let picking = $state(false);
	const quick = $derived(menuOpen ? quickReactions(savedPickCounts()) : []);
	let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null;

	function pressStart(event: PointerEvent) {
		if (event.pointerType === 'mouse' || !message.body || status) return;
		const timer = setTimeout(() => (menuOpen = true), 500);
		press = { timer, x: event.clientX, y: event.clientY };
	}

	function pressEnd() {
		if (press) clearTimeout(press.timer);
		press = null;
	}

	/** A finger that moves is scrolling, not holding. */
	function pressMove(event: PointerEvent) {
		if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) pressEnd();
	}

	function pickReaction() {
		menuOpen = false;
		picking = true;
	}

	async function copyText() {
		await navigator.clipboard.writeText(docText(words!));
		toast(s.copied);
	}

	const confirmDelete: SubmitFunction = ({ cancel }) => {
		if (!confirm(s.confirmDelete)) cancel();
	};
</script>

<!-- Campsite's chat: grey bubbles on the left for others, blue on the right for you, runs from
     one person joined by tighter corners. Actions show beside the bubble on hover. -->
<div
	class="message"
	id="message-{message.id}"
	data-mine={mine || undefined}
	data-position={position}
	data-group={group || undefined}
>
	{#if showName && !mine}
		<p class="name">{message.authorName}</p>
	{/if}
	<div class="line">
		{#if group && !mine}
			<!-- The name is in text above the run, so the face is decoration. -->
			<span class="face" aria-hidden="true">
				{#if showAvatar}<Avatar name={message.authorName} size="md" />{/if}
			</span>
		{/if}
		<div class="stack">
			{#if message.replyTo}
				<!-- Campsite's ReplyPreview: who it answers on a quiet line, then the quoted text in a
				     faded bubble, its corner toward the sender tightened like a run's. -->
				<p class="quote-who">
					<Icon name="reply" size={12} strokeWidth="2" />
					<span
						>{replyLabel({
							quoted: { id: message.replyTo.authorId, name: message.replyTo.authorName },
							replier: { id: message.authorId, name: message.authorName },
							viewerId
						})}</span
					>
				</p>
				<p class="quote">{message.replyTo.text ?? s.deleted}</p>
			{/if}
			{#if editing && message.body}
				<div class="edit">
					<MessageForm
						action="?/edit"
						messageId={message.id}
						value={message.body}
						{members}
						{uploadUrl}
						submitLabel={s.save}
						oncancel={() => (editing = false)}
						onsaved={() => (editing = false)}
					/>
				</div>
			{:else}
				<div class="row">
					<!-- A long press here is the touch way to the menu; the menu's button is the other. -->
					<div
						class="body"
						role="presentation"
						onpointerdown={pressStart}
						onpointermove={pressMove}
						onpointerup={pressEnd}
						onpointercancel={pressEnd}
						oncontextmenu={(event) => touch.current && event.preventDefault()}
					>
						{#if !message.body || words}
							<div
								class="bubble"
								data-deleted={!message.body || undefined}
								title={time.long(message.createdAt, page.data.timeZone)}
							>
								<span class="u:visually-hidden">{message.authorName}, </span>
								{#if words}
									<RichText doc={words} customEmoji={orgEmoji.custom} {resources} compact />
								{:else}
									<p>{s.deleted}</p>
								{/if}
								{#if touch.current && message.body && !status}
									<span class="u:visually-hidden">{s.longPress}</span>
								{/if}
							</div>
						{/if}
						{#if fileNodes.length}<MessageFiles
								nodes={fileNodes}
								customEmoji={orgEmoji.custom}
								origin={page.url.origin}
							/>{/if}
					</div>
					{#if message.body && !status}
						<div class="actions">
							<Reactions
								summaries={message.reactions}
								subjectType="message"
								subjectId={message.id}
								canReact
								addOnly
								{orgEmoji}
								{boundary}
								bind:picking
							/>
							<IconButton icon="reply" label={s.reply} onclick={onreply} quiet />
							<Menu align="end" bind:open={menuOpen}>
								{#snippet trigger({ props })}
									<IconButton {...props} icon="dots-horizontal" label={core.actions.more} quiet />
								{/snippet}
								{#snippet sheetHeader()}
									<form
										class="quick"
										method="POST"
										action="?/react"
										use:enhance={() => {
											menuOpen = false;
											return ({ update }) => update();
										}}
									>
										<input type="hidden" name="subjectType" value="message" />
										<input type="hidden" name="subjectId" value={message.id} />
										{#each quick as emoji (emoji)}
											<button
												name="emoji"
												value={emoji}
												aria-label={s.reactWith(emoji)}
												aria-pressed={message.reactions.some((r) => r.emoji === emoji && r.mine)}
											>
												<Emoji value={emoji} customEmoji={orgEmoji.custom} />
											</button>
										{/each}
										<button type="button" aria-label={posts.reactions.add} onclick={pickReaction}>
											<Icon name="face-smile-plus" size={28} />
										</button>
									</form>
								{/snippet}
								{#if onpost}
									<DropdownMenu.Item onSelect={onpost}>
										<Icon name="post-plus" />
										{s.startPost}
									</DropdownMenu.Item>
								{/if}
								{#if words}
									<DropdownMenu.Item onSelect={copyText}>
										<Icon name="copy" />
										{s.copyText}
									</DropdownMenu.Item>
								{/if}
								{#if mine || admin}
									<DropdownMenu.Item onSelect={() => (editing = true)}>
										<Icon name="pencil" />
										{s.edit}
									</DropdownMenu.Item>
								{/if}
								<DropdownMenu.Item onSelect={onreply}>
									<Icon name="reply" />
									{s.reply}
								</DropdownMenu.Item>
								{#if mine || admin}
									{#if files.length}
										<DropdownMenu.Item onSelect={() => (deletingFiles = true)}>
											<Icon name="paperclip" />
											{chat.deleteAttachments.menu}
										</DropdownMenu.Item>
									{/if}
									<DropdownMenu.Separator />
									<form method="POST" action="?/delete" use:enhance={confirmDelete}>
										<input type="hidden" name="messageId" value={message.id} />
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
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
	<!-- Campsite's Engagements: under the whole line, so the face stays level with the bubble's
	     last line, and in groups past the face column. -->
	{#if !editing && shownReactions(message.id, message.reactions).length}
		<div class="reactions">
			<Reactions
				summaries={message.reactions}
				subjectType="message"
				subjectId={message.id}
				canReact
				{orgEmoji}
				{boundary}
			/>
		</div>
	{/if}
	{#if !editing && message.editedAt && message.body}<p class="edited">{s.edited}</p>{/if}
	{#if status === 'sending'}
		<p class="status" data-status="sending">{s.stillSending}</p>
	{:else if status === 'failed'}
		<p class="status" data-status="failed" role="alert">
			{s.notSent}
			<button type="button" class="retry" onclick={onretry}>{s.retry}</button>
		</p>
	{/if}
</div>

{#if files.length && (mine || admin)}
	<DeleteAttachmentsDialog bind:open={deletingFiles} messageId={message.id} {files} />
{/if}

<style>
	.message {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		margin-block-end: 0.125rem;
	}

	.message[data-mine] {
		align-items: flex-end;
	}

	/* A message is highlighted when a link targets it, such as a summary's citation. */
	.message:target {
		background-color: var(--hue-selected);
	}

	/* Campsite's thread: runs 12px apart, plus each bubble's own 2px. */
	.message[data-position='last'],
	.message[data-position='only'] {
		margin-block-end: calc(var(--gap-md) + 0.125rem);
	}

	.name {
		margin: 0 0 0.125rem;
		padding-inline-start: 0.875rem;
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		line-height: 1rem;
	}

	.message[data-group] .name {
		/* Past the face column: 32px face, 8px gap, then the bubble's own inset. */
		padding-inline-start: calc(2rem + var(--gap-sm) + 0.875rem);
	}

	.line {
		display: flex;
		gap: var(--gap-sm);
		align-items: flex-end;
		inline-size: 100%;
	}

	.message[data-mine] .line {
		justify-content: flex-end;
	}

	.face {
		flex: none;
		inline-size: 2rem;
		translate: 0 -0.25rem;
	}

	.stack {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.125rem;
		max-inline-size: 80%;
		min-inline-size: 0;
	}

	.message[data-mine] .stack {
		align-items: flex-end;
	}

	.row {
		display: flex;
		gap: 0.375rem;
		align-items: center;
		max-inline-size: 100%;
	}

	.message[data-mine] .row {
		flex-direction: row-reverse;
	}

	.body {
		display: grid;
		/* An auto track grows to its widest child's min-content, and the files card's 18rem pushed
		   past a phone's edge; minmax(0, 1fr) keeps the column at the body's width. */
		grid-template-columns: minmax(0, 1fr);
		gap: 0.125rem;
		justify-items: start;
		min-inline-size: 0;
	}

	.message[data-mine] .body {
		justify-items: end;
	}

	/* Campsite's quick reactions: 48px round buttons, the emoji at 26px, in the sheet's header. */
	.quick {
		display: contents;
	}

	.quick button {
		display: grid;
		place-items: center;
		inline-size: 3rem;
		block-size: 3rem;
		border: 0;
		border-radius: var(--radius-full);
		background-color: var(--hue-z1-bg);
		color: var(--hue-z1-muted);
		font-size: var(--text-2xl);
	}

	.quick button[aria-pressed='true'] {
		background-color: var(--hue-selected);
	}

	.bubble {
		min-inline-size: 0;
		padding: var(--gap-sm) 0.875rem;
		border-radius: 1.125rem;
		background-color: var(--hue-bubble);
		color: var(--hue-z0-fg);
		font-size: var(--type-body);
		line-height: 1.25rem;
		overflow-wrap: anywhere;
	}

	.bubble :global(p) {
		margin: 0;
	}

	/* prose.css gives .prose `break-word`, which leaves a long word's min-content its full length
	   and so widens the bubble past its row; `anywhere` counts the break in. */
	.bubble :global(.prose) {
		overflow-wrap: anywhere;
	}

	/* Campsite's chat-prose: 16px on phones and tablets, 14px from 1024px up. */
	@media (max-width: 63.99rem) {
		.bubble,
		.bubble :global(.prose) {
			font-size: 1rem;
			line-height: 1.5rem;
		}
	}

	.message[data-mine] .bubble {
		background-color: var(--hue-bubble-mine);
		color: var(--hue-bubble-mine-fg);
	}

	.message[data-mine] .bubble :global(*) {
		color: inherit;
	}

	/* Code in your own bubble keeps the bubble's white text, so it sits on a darker blue. */
	.message[data-mine] .bubble :global(:is(:not(pre) > code, pre, kbd)) {
		background-color: var(--hue-bubble-mine-code);
		box-shadow: none;
	}

	.bubble[data-deleted] {
		background-color: var(--hue-selected);
		color: var(--hue-z0-muted);
	}

	/* Runs: the corners toward the next or last bubble from the same person tighten to 4px. */
	.message:not([data-mine])[data-position='first'] .bubble {
		border-end-start-radius: 0.25rem;
	}

	.message:not([data-mine])[data-position='middle'] .bubble {
		border-start-start-radius: 0.25rem;
		border-end-start-radius: 0.25rem;
	}

	.message:not([data-mine])[data-position='last'] .bubble {
		border-start-start-radius: 0.25rem;
	}

	.message[data-mine][data-position='first'] .bubble {
		border-end-end-radius: 0.25rem;
	}

	.message[data-mine][data-position='middle'] .bubble {
		border-start-end-radius: 0.25rem;
		border-end-end-radius: 0.25rem;
	}

	.message[data-mine][data-position='last'] .bubble {
		border-start-end-radius: 0.25rem;
	}

	/* Hover actions: hidden until the row is hovered or focused, always there on touch. */
	.actions {
		display: flex;
		flex: none;
		align-items: center;
		opacity: 0;
		transition: opacity var(--motion-fast) var(--motion-ease);
	}

	.row:hover .actions,
	.row:focus-within .actions,
	.actions:has([aria-expanded='true']) {
		opacity: 1;
	}

	/* On a touch screen Campsite hides these and opens the message's menu on a long press, as a
	   sheet with the quick reactions on top. They stay clipped, not removed, so a screen reader
	   still reaches them; a keyboard reaching one opens the row under the bubble. */
	@media (hover: none) and (pointer: coarse) {
		.row {
			flex-wrap: wrap;
		}

		.actions {
			position: absolute;
			clip-path: inset(50%);
		}

		.actions:has(:focus-visible) {
			position: static;
			flex-basis: 100%;
			padding-block-start: 0.125rem;
			clip-path: none;
			opacity: 1;
		}

		.message[data-mine] .actions {
			justify-content: flex-end;
		}

		/* A long press opens the menu, not the system's text selection and callout. */
		.bubble {
			-webkit-touch-callout: none;
			user-select: none;
		}
	}

	/* With a pointer, the actions hang beside the bubble without taking room from it, so a
	   message wraps at the same width whether or not it can be reacted to. The padding bridges
	   the gap, so moving to them doesn't end the hover. */
	@media (hover: hover) {
		.row {
			position: relative;
		}

		.actions {
			position: absolute;
			inset-block: 0;
			inset-inline-start: 100%;
			padding-inline-start: 0.375rem;
		}

		.message[data-mine] .actions {
			inset-inline: auto 100%;
			padding-inline: 0 0.375rem;
		}
	}

	/* Campsite's Engagements: the pills ride up 6px over the bubble's lower edge, each cut out
	   of it by a 2px ring of the page colour, so they read as attached to the message. */
	.reactions {
		position: relative;
		margin-block: -0.375rem 0.125rem;
	}

	.reactions :global(.pill) {
		box-shadow: 0 0 0 2px var(--hue-z0-bg);
	}

	.message[data-group]:not([data-mine]) .reactions {
		/* Past the 32px face and its 8px gap. */
		padding-inline-start: calc(2rem + var(--gap-sm));
	}

	.message[data-group]:not([data-mine]) .edited {
		padding-inline-start: calc(2rem + var(--gap-sm) + 0.875rem);
	}

	.quote {
		max-inline-size: min(100%, 28rem);
		margin: 0;
		padding: 0.375rem 0.875rem;
		overflow: hidden;
		border-radius: 0.875rem;
		background-color: var(--hue-bubble);
		/* Campsite's tertiary grey here is 4.1:1 on the bubble; secondary keeps 12px above 4.5. */
		color: var(--hue-text-secondary);
		font-size: var(--type-caption);
		line-height: 1rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.message:not([data-mine]) .quote {
		border-end-start-radius: 0.25rem;
	}

	.message[data-mine] .quote {
		border-end-end-radius: 0.25rem;
	}

	.quote-who {
		display: flex;
		gap: var(--gap-xs);
		align-items: center;
		margin: 0.25rem 0.875rem 0 0.625rem;
		/* Campsite's quaternary is 2.5:1 on white; muted is as quiet and passes. */
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		line-height: 1rem;
	}

	.message[data-mine] .quote-who {
		margin-inline: 0 0.875rem;
	}

	.edited,
	.status {
		margin: 0;
		padding-inline: 0.875rem;
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}

	/* Most messages land well inside the wait, so the line never shows for them, and it takes
	   no room until it does. */
	.status[data-status='sending'] {
		animation: after-a-wait var(--motion-instant) var(--motion-delay-pending) backwards;
	}

	.status[data-status='failed'] {
		color: var(--hue-danger);
	}

	.retry {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		font-weight: var(--fw-medium);
		text-decoration: underline;
		cursor: pointer;
	}

	/* Firefox, and Safari before 18, don't animate display; for them the line keeps its room
	   but stays hidden. */
	@keyframes after-a-wait {
		from,
		to {
			display: none;
			visibility: hidden;
		}
	}

	.edit {
		inline-size: min(36rem, 80vw);
	}
</style>
