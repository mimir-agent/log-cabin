<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto, invalidate, pushState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { DocNode } from '#lib/editor/doc.js';
	import Summary from '#lib/components/ai/Summary.svelte';
	import CallRow from '#lib/components/chat/CallRow.svelte';
	import Message, { type Position } from '#lib/components/chat/Message.svelte';
	import MessageForm from '#lib/components/chat/MessageForm.svelte';
	import ThreadAvatar from '#lib/components/chat/ThreadAvatar.svelte';
	import ThreadMenu from '#lib/components/chat/ThreadMenu.svelte';
	import { arrived, outgoing, retry, sendMessage } from '#lib/components/chat/outgoing.svelte.js';
	import ChannelMarks from '#lib/components/shell/ChannelMarks.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import SubTabs from '#lib/components/shell/SubTabs.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';
	import { postAction } from '#lib/forms/submit.js';
	import { typingIn } from '#lib/keyboard.js';
	import { sendTyping, subscribe } from '#lib/realtime.js';
	import { calls } from '#lib/strings/calls.js';
	import { core } from '#lib/strings/core.js';
	import { chat } from '#lib/strings/chat.js';
	import { ai } from '#lib/strings/ai.js';
	import { time } from '#lib/strings/time.js';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();
	const s = chat.thread;
	const thread = $derived(data.thread);
	// A DM with someone deactivated is kept to read; nothing new can be sent in it.
	const closed = $derived(
		thread.kind === 'dm' ? (thread.people.find((p) => p.deactivated) ?? null) : null
	);
	const topic = $derived(`thread:${thread.id}`);
	const uploadUrl = $derived(`/chat/${thread.id}/attachments`);
	// A member's page, so the root layout has the org's emoji.
	const orgEmoji = $derived(data.orgEmoji!);
	// The content column, which reaction pickers stay inside.
	let column = $state<HTMLElement | null>(null);
	const nameOf = (id: string) => thread.people.find((p) => p.id === id)?.name ?? '';

	// Who else has this thread open, and who is typing; both come only from the socket.
	let present = $state<string[]>([]);
	let typing = $state<string[]>([]);
	const typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};
	function heardTyping(userId: string) {
		clearTimeout(typingTimers[userId]);
		if (!typing.includes(userId)) typing = [...typing, userId];
		typingTimers[userId] = setTimeout(() => (typing = typing.filter((id) => id !== userId)), 4000);
	}

	$effect(() =>
		subscribe(topic, (payload) => {
			if (payload.type === 'presence') present = payload.userIds as string[];
			else if (payload.type === 'typing') heardTyping(payload.userId as string);
			// Deleted for everyone: there is nothing left to show.
			else if (payload.type === 'thread.deleted') goto(resolve('/chat'), { replace: true });
			// Taken out of the thread: its load now 404s, which the page shows.
			else if (payload.type === 'denied') invalidate('chat:thread');
			else if (payload.type !== 'resync') {
				// The list beside the thread shows the last message too, so refresh both.
				invalidate('chat:thread');
				invalidate('chat:threads');
			}
		})
	);

	// Opening the thread, and each message that arrives while it is open, marks it read. Its
	// load can't: that also runs when a link to the thread is hovered. The list beside it, and
	// the sidebar's badges, load again once that's done.
	const threadId = $derived(thread.id);
	const lastMessageId = $derived(data.messages.at(-1)?.id);
	$effect(() => {
		void lastMessageId;
		postAction(`/chat/${threadId}?/read`, new FormData()).then(() => invalidate('chat:threads'));
	});

	let lastTypingSent = 0;
	function typed() {
		if (Date.now() - lastTypingSent < 2500) return;
		lastTypingSent = Date.now();
		sendTyping(topic);
	}

	const others = $derived(present.filter((id) => id !== data.viewerId).map(nameOf));
	const otherPeople = $derived(thread.people.filter((p) => p.id !== data.viewerId));
	// A group says how many are in it; a direct message says what time it is for the other
	// person, but only once they've chosen a zone: UTC is the default, so it may not be theirs.
	const subline = $derived.by(() => {
		if (thread.kind !== 'dm') return s.members(thread.people.length);
		const zone = otherPeople[0]?.timezone;
		const clock = zone && zone !== 'UTC' ? time.clockIn(zone) : null;
		return clock ? s.localTime(clock) : '';
	});
	const typingNames = $derived(typing.map(nameOf));
	let replyTo = $state<{ id: string; authorId: string; authorName: string } | null>(null);
	let composer = $state<ReturnType<typeof MessageForm>>();
	/** The message being edited in place, one at a time. */
	let editingId = $state<string | null>(null);

	// ArrowUp in the empty box edits your last message still there (Campsite's).
	function editLastMessage() {
		const last = data.messages.findLast((m) => m.authorId === data.viewerId && m.body);
		if (last) editingId = last.id;
	}

	// Start a post… opens the new-post dialog over the thread, seeded with the message: in the
	// channel's project, or else the one New post opens in.
	const postProject = $derived(
		data.thread.projectId ??
			[...(data.sidebarProjects?.favorites ?? []), ...(data.sidebarProjects?.joined ?? [])][0]?.id
	);
	function startPost(id: string, body: DocNode) {
		pushState(resolve('/projects/[id]/new', { id: postProject! }), {
			newPost: postProject,
			fromMessage: { id, body }
		});
	}

	function pasted(event: ClipboardEvent) {
		// An editor that took the paste has prevented it, whatever the event's target.
		if (closed || event.defaultPrevented || typingIn(event.target) || !event.clipboardData) return;
		const text = event.clipboardData.getData('text/plain');
		if (!event.clipboardData.files.length && !text) return;
		event.preventDefault();
		if (event.clipboardData.files.length) composer?.attach(event.clipboardData.files);
		else composer?.pasteText(text);
	}

	// Campsite's runs: messages from one person less than half an hour apart join into one run,
	// and a gap longer than that gets a time between runs. Your messages still on their way
	// come last, in full, until the server's copy replaces each one.
	const runGap = 30 * 60 * 1000;
	const group = $derived(thread.people.length > 2);
	const sending = $derived(
		outgoing.filter((o) => o.threadId === thread.id && !data.messages.some((m) => m.id === o.id))
	);
	// However the server's copy came, by the answer or the socket, the one shown for it is done.
	$effect(() => arrived(data.messages.map((m) => m.id)));
	const shown = $derived([
		...data.messages.map((message) => ({ message, pending: undefined })),
		...sending.map((o) => ({
			pending: o,
			message: {
				id: o.id,
				authorId: data.viewerId,
				authorName: nameOf(data.viewerId),
				body: o.body,
				createdAt: o.sentAt,
				editedAt: null,
				replyTo: replyPreview(o.replyToId),
				reactions: []
			}
		}))
	]);
	function replyPreview(id: string | null) {
		const parent = data.messages.find((m) => m.id === id);
		return parent
			? { authorId: parent.authorId, authorName: parent.authorName, text: parent.bodyText }
			: null;
	}
	// The messages with the lines for who was added, removed or left, and the calls, in time
	// order. A line or a call ends a run, as a gap does.
	const timeline = $derived(
		[
			...shown.map((entry) => ({ ...entry, at: entry.message.createdAt })),
			// Lines from before the first message shown wait for the page they belong to.
			...data.updates
				.filter((u) => !data.olderFrom || u.createdAt >= data.messages[0].createdAt)
				.map((update) => ({ update, at: update.createdAt })),
			...(data.calls?.ended ?? []).map((call) => ({
				call: { live: false as const, ...call },
				at: call.startedAt
			})),
			...(data.calls?.live
				? [{ call: { live: true as const, ...data.calls.live }, at: data.calls.live.startedAt }]
				: [])
		].sort((a, b) => a.at - b.at)
	);
	const messageAt = (i: number) => {
		const entry = timeline[i];
		return entry && 'message' in entry ? entry.message : undefined;
	};
	function updateLine(update: PageProps['data']['updates'][number]): string {
		const t = chat.timeline;
		if (update.left) return t.left(update.actorName);
		return update.added.length
			? t.added(update.actorName, update.added)
			: t.removed(update.actorName, update.removed);
	}
	const rows = $derived.by(() =>
		timeline.map((entry, i) => {
			const gapBefore = i === 0 || entry.at - timeline[i - 1].at > runGap;
			if ('update' in entry) {
				return {
					kind: 'update' as const,
					key: entry.update.id,
					at: entry.at,
					update: entry.update,
					gapBefore
				};
			}
			if ('call' in entry) {
				return {
					kind: 'call' as const,
					key: entry.call.id,
					at: entry.at,
					call: entry.call,
					gapBefore
				};
			}
			const { message, pending } = entry;
			const prev = messageAt(i - 1);
			const next = messageAt(i + 1);
			const joinsPrev = !gapBefore && prev?.authorId === message.authorId;
			const joinsNext =
				!!next &&
				next.createdAt - message.createdAt <= runGap &&
				next.authorId === message.authorId;
			const position: Position = joinsPrev
				? joinsNext
					? 'middle'
					: 'last'
				: joinsNext
					? 'first'
					: 'only';
			return {
				kind: 'message' as const,
				key: message.id,
				at: entry.at,
				message,
				pending,
				gapBefore,
				position,
				showName: !joinsPrev,
				showAvatar: !joinsNext
			};
		})
	);

	let end = $state<HTMLElement>();
	let barHeight = $state(0);
	let top = $state<HTMLElement>();
	// Within a screen's reach of the end, the thread follows new messages down; further up, a
	// button says they came (Campsite's UnseenMessagesButton).
	let atBottom = $state(true);
	let unseen = $state(false);
	let lastShown: string | undefined;
	$effect(() => {
		const last = rows.at(-1);
		const key = last && `${thread.id}:${last.key}`;
		if (key === lastShown) return;
		const opened = !lastShown?.startsWith(`${thread.id}:`);
		lastShown = key;
		const mine = last?.kind === 'message' && last.message.authorId === data.viewerId;
		if (opened || mine || untrack(() => atBottom)) end?.scrollIntoView({ block: 'end' });
		else unseen = true;
	});

	function scrolled() {
		atBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - innerHeight / 2;
		if (atBottom) unseen = false;
	}

	// The page before loads when the top of the thread comes into view, and the reader stays on
	// the message they were reading.
	$effect(() => {
		const from = data.olderFrom;
		if (!top || !from) return;
		const observer = new IntersectionObserver(async ([entry]) => {
			if (!entry.isIntersecting) return;
			observer.disconnect();
			// A message, not the sibling after the sentinel: that is the first row's date divider, and it
			// goes when the older page lands, which would leave the reader at the top and the next page loading.
			const anchor = top!.parentElement!.querySelector('[id^="message-"]');
			const before = anchor?.getBoundingClientRect().top ?? 0;
			const older = `${resolve('/chat/[id]', { id: thread.id })}?from=${from}`;
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- the path is resolved; ?from is its query
			await goto(older, { replace: true, reset: false });
			await tick();
			scrollBy(0, (anchor?.getBoundingClientRect().top ?? before) - before);
		});
		observer.observe(top);
		return () => observer.disconnect();
	});
</script>

<svelte:head>
	<title>{thread.name} · {core.appName}</title>
</svelte:head>

{#snippet headerLine()}
	<span title={thread.people.map((p) => p.name).join(', ')}>{subline}</span>
	{#if others.length > 0}{subline ? ' · ' : ''}{s.viewing(others)}{/if}
{/snippet}

{#snippet channelMarks()}
	<ChannelMarks private={thread.projectPrivate} archived={thread.projectArchived} />
{/snippet}

<!-- Campsite's conversation titlebar: the thread's face at 32px, the name, and under it the
     member count for a group or the other person's local time for a direct message. The full
     list of names is the title's tooltip. A channel's chat is the same bar as its posts on a
     phone: back to the channels, the name with its marks, call, "…". -->
<PageHeader
	title={thread.name}
	back={thread.projectId ? resolve('/projects') : '/chat'}
	marks={thread.projectId ? channelMarks : undefined}
	stacked
	description={subline || others.length > 0 ? headerLine : undefined}
>
	{#snippet leading()}
		<ThreadAvatar
			faces={otherPeople.slice(0, 3).map((p) => p.name)}
			group={thread.kind !== 'dm'}
			src={thread.pictureUrl}
			size="md"
		/>
	{/snippet}
	{#snippet actions()}
		{#if data.calls && !data.calls.live}
			<form method="POST" action="?/startCall">
				<IconButton type="submit" icon="video-camera" label={calls.place.start} />
			</form>
		{/if}
		<ThreadMenu
			{thread}
			viewerId={data.viewerId}
			addable={data.addable}
			canDelete={data.canDelete}
			editError={form?.editError}
		/>
	{/snippet}
</PageHeader>

{#if thread.projectId}
	<SubTabs
		label={chat.channel.tabsLabel}
		tabs={[
			{
				href: resolve('/projects/[id]', { id: thread.projectId }),
				label: chat.channel.posts,
				current: false
			},
			{ href: resolve('/chat/[id]', { id: thread.id }), label: chat.channel.chat, current: true }
		]}
	/>
{/if}

<!-- Files dropped anywhere on the thread, or pasted while nothing else has focus, attach to
     the message being written (Campsite's dropzone and useUnfocusedPaste). -->
<svelte:window onpaste={pasted} onscroll={scrolled} />

<div
	class="thread"
	bind:this={column}
	style:--composer-bar-h="{barHeight}px"
	role="presentation"
	ondragover={(event) => {
		if (!closed && event.dataTransfer?.types.includes('Files')) event.preventDefault();
	}}
	ondrop={(event) => {
		if (closed || !event.dataTransfer?.files.length || typingIn(event.target)) return;
		event.preventDefault();
		composer?.attach(event.dataTransfer.files);
	}}
>
	{#if data.summaries !== 'off'}
		<div class="summary">
			<Summary
				summary={form?.summary}
				error={form?.summaryError}
				tooShort={data.summaries === 'tooShort'}
				disclaimer={ai.summary.threadDisclaimer}
			/>
		</div>
	{/if}

	<div class="messages">
		{#if data.olderFrom}<div class="older" bind:this={top}></div>{/if}
		{#each rows as row (row.key)}
			{#if row.gapBefore}
				<p class="divider">
					<time datetime={new Date(row.at).toISOString()}
						>{time.divider(row.at, data.timeZone)}</time
					>
				</p>
			{/if}
			{#if row.kind === 'update'}
				<p class="update">{updateLine(row.update)}</p>
			{:else if row.kind === 'call'}
				<CallRow {...row.call} />
			{:else}
				{@const pending = row.pending}
				{@const message = row.message}
				<Message
					{message}
					viewerId={data.viewerId}
					admin={data.admin}
					members={thread.people}
					{orgEmoji}
					resources={data.resources}
					boundary={column}
					{uploadUrl}
					position={row.position}
					showName={group && row.showName}
					showAvatar={row.showAvatar}
					{group}
					onreply={() =>
						(replyTo = {
							id: message.id,
							authorId: message.authorId,
							authorName: message.authorName
						})}
					onpost={postProject && message.body
						? () => startPost(message.id, message.body!)
						: undefined}
					status={pending && (pending.failed ? 'failed' : 'sending')}
					onretry={pending && (() => retry(pending))}
					bind:editing={
						() => editingId === message.id, (on) => (editingId = on ? message.id : null)
					}
				/>
			{/if}
		{:else}
			<p class="empty">{s.empty}</p>
		{/each}
		{#if data.held}
			<!-- Campsite's DNDIndicator: the other person's notifications are held. -->
			<div class="held">
				<p><Icon name="moon-filled" size={16} /> {s.paused(data.held.name)}</p>
				{#if data.held.canNotify}
					<form
						method="POST"
						action="?/notifyAnyway"
						use:enhance={() =>
							async ({ result, update }) => {
								if (result.type === 'success') toast(s.notified(data.held!.name));
								await update();
							}}
					>
						<button type="submit" class="link">{s.notifyAnyway}</button>
					</form>
				{/if}
			</div>
		{/if}
		<p class="typing" aria-live="polite" bind:this={end}>
			{typingNames.length > 0 ? s.typing(typingNames) : ''}
		</p>
	</div>

	<div class="composer-bar" bind:clientHeight={barHeight}>
		{#if unseen}
			<div class="unseen">
				<Button size="sm" onclick={() => end?.scrollIntoView({ behavior: 'smooth', block: 'end' })}>
					<Icon name="arrow-down" />
					{s.newMessages}
				</Button>
			</div>
		{/if}
		{#if closed}
			<p class="closed">{s.deactivated(closed.name)}</p>
		{:else}
			{#if replyTo}
				<p class="replying">
					<span>
						{replyTo.authorId === data.viewerId
							? s.replyingToYourMessage
							: s.replyingTo(replyTo.authorName)}
					</span>
					<button type="button" class="link" onclick={() => (replyTo = null)}>{s.cancel}</button>
				</p>
			{/if}
			<MessageForm
				bind:this={composer}
				action="?/send"
				replyTo={replyTo?.id}
				members={thread.people}
				{uploadUrl}
				submitLabel={s.send}
				onsaved={() => (replyTo = null)}
				ontyping={typed}
				onsend={(form) => sendMessage(thread.id, form)}
				onemptyarrowup={editLastMessage}
			/>
		{/if}
	</div>
</div>

<style>
	/* Campsite's thread: a 48rem column, centred from 1024px up (bubbles cap at 80% of it),
	   12–16px from the edges, and the composer stays pinned to the bottom. */
	.thread {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-block-size: 0;
	}

	.summary {
		padding: var(--gap-md) var(--gap-md) 0;
	}

	.messages {
		display: flex;
		flex: 1;
		flex-direction: column;
		justify-content: flex-end;
		padding: var(--gap-lg) var(--gap-md) 0;
	}

	@media (min-width: 64rem) {
		.messages,
		.composer-bar,
		.summary {
			padding-inline: var(--gap-lg);
			inline-size: 100%;
			max-inline-size: 48rem;
			margin-inline: auto;
		}
	}

	.divider,
	.update {
		margin: var(--gap-sm) 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		text-align: center;
	}

	.empty {
		margin: auto 0;
		color: var(--hue-z0-muted);
		text-align: center;
	}

	.typing {
		min-block-size: 1.25rem;
		margin: 0;
		/* It's what the thread scrolls to; keep it clear of the sticky composer. */
		scroll-margin-block-end: calc(3.5rem + env(safe-area-inset-bottom));
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}

	.composer-bar {
		position: sticky;
		inset-block-end: var(--keyboard-inset);
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		padding: var(--gap-sm) var(--gap-md);
		background-color: var(--hue-z0-bg);
	}

	/* A conversation hides the tab bar on small screens, so the composer sits on the bottom edge,
	   clear of the home indicator (Campsite's pb-safe-offset-2), until the keyboard covers it. */
	@media (max-width: 63.99rem) {
		.composer-bar {
			padding-block-end: calc(var(--gap-sm) + env(safe-area-inset-bottom));
		}

		.composer-bar:has(:global(.ProseMirror-focused)) {
			padding-block-end: var(--gap-sm);
		}
	}

	.closed {
		margin: 0;
		padding: var(--gap-md);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		text-align: center;
	}

	/* Over the composer, centred, while new messages wait below. */
	.unseen {
		position: absolute;
		inset-block-end: calc(100% + var(--gap-sm));
		inset-inline: 0;
		inline-size: max-content;
		margin-inline: auto;
	}

	.older {
		block-size: 1px;
	}

	/* Campsite's DNDIndicator: small and centred under the last message. */
	.held {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		align-items: center;
		margin-block-start: var(--gap-md);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}

	.held p {
		display: flex;
		gap: var(--gap-xs);
		align-items: center;
		margin: 0;
	}

	.replying {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		margin: 0;
		padding: 0.375rem var(--gap-md);
		border-radius: 1.125rem;
		background-color: var(--hue-hover);
		color: var(--hue-text-secondary);
		font-size: var(--type-caption);
	}

	.link {
		margin-inline-start: auto;
		padding: 0;
		border: 0;
		background: none;
		color: var(--hue-z0-fg);
		font: inherit;
		font-weight: var(--fw-medium);
		cursor: pointer;
	}
</style>
