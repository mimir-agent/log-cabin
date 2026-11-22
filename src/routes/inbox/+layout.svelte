<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import { DropdownMenu } from 'bits-ui';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import RemindMe from '#lib/components/posts/RemindMe.svelte';
	import Emoji from '#lib/components/posts/Emoji.svelte';
	import ReasonAvatar from '#lib/components/shell/ReasonAvatar.svelte';
	import ViewTabs from '#lib/components/shell/ViewTabs.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import { optimistic } from '#lib/forms/submit.js';
	import type { IconName } from '#lib/components/ui/icons/campsite-icons.js';
	import { core } from '#lib/strings/core.js';
	import { notifications as s } from '#lib/strings/notifications.js';
	import { posts } from '#lib/strings/posts.js';
	import { calendarDay } from '#lib/time-zone.js';
	import { time } from '#lib/strings/time.js';
	import { preloadInView } from '#lib/preload.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	type Item = (typeof data.items)[number];
	// Marked read, archived, done or dismissed here: off the list at once, back on it if the
	// server refuses. (The sidebar's unread count follows the socket, which the server tells
	// first.)
	let triaged = $state.raw<string[]>([]);
	const items = $derived(data.items.filter((item) => !triaged.includes(item.itemKey)));
	// The list's forms post to /inbox from wherever the pane is, and the page stays put.
	const stay: SubmitFunction =
		() =>
		({ update }) =>
			update({ navigate: false });
	const triage = optimistic((form) => {
		const key = String(form.get('item'));
		triaged = [...triaged, key];
		return () => (triaged = triaged.filter((k) => k !== key));
	});
	// The item being opened keeps its pressed fill until its page is ready.
	const opening = $derived(
		navigating.to && navigating.to.url.pathname + navigating.to.url.search + navigating.to.url.hash
	);
	type Tone = 'neutral' | 'mention' | 'blue' | 'green' | 'brand';

	// Why it reached you, as a badge on the avatar's corner (Campsite's notification reasons).
	const reasons: Record<Item['kind'], { icon: IconName; tone: Tone }> = {
		mention: { icon: 'at-sign', tone: 'mention' },
		comment: { icon: 'quote', tone: 'neutral' },
		reply: { icon: 'reply2', tone: 'neutral' },
		message: { icon: 'chat-bubble-filled', tone: 'blue' },
		post: { icon: 'post', tone: 'neutral' },
		note: { icon: 'note-filled', tone: 'blue' },
		call: { icon: 'video-camera-filled', tone: 'green' },
		feedback: { icon: 'question-mark', tone: 'brand' },
		follow_up: { icon: 'alarm', tone: 'neutral' },
		join_request: { icon: 'user-circle-plus', tone: 'neutral' },
		reaction: { icon: 'face-smile', tone: 'neutral' },
		added_to_project: { icon: 'project', tone: 'neutral' },
		project_renamed: { icon: 'pencil', tone: 'neutral' },
		project_archived: { icon: 'archive', tone: 'neutral' },
		post_moved: { icon: 'arrow-right', tone: 'neutral' },
		comment_resolved: { icon: 'check-circle', tone: 'neutral' },
		post_resolved: { icon: 'check-circle', tone: 'neutral' },
		post_resolved_from_comment: { icon: 'check-circle', tone: 'neutral' }
	};

	const unread = $derived(data.tab === 'unread');
	const canTriage = $derived(data.tab !== 'archived');

	// From 1024px a post opens in the pane beside the list, as Campsite's inbox does; below
	// that, a row is a plain link to the post's own page.
	const wide = new MediaQuery('min-width: 64rem');
	const hrefOf = (item: Item) =>
		wide.current && item.postId
			? `${resolve('/inbox/posts/[id]', { id: item.postId })}?tab=${data.tab}${hashOf(item.url)}`
			: item.url;
	const hashOf = (url: string) => (url.includes('#') ? url.slice(url.indexOf('#')) : '');
	const selected = $derived((navigating.to?.params ?? page.params).id);
	const inbox = $derived(`${resolve('/inbox')}?tab=${data.tab}`);
	let list = $state<HTMLElement>();

	// j/k or the arrow keys move through the rows, Enter opens one, Esc closes the pane. Never
	// while typing, or inside a menu or dialog, which have keys of their own.
	function onkeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
		if (
			target.closest('input, textarea, select, [contenteditable], [role="menu"], [role="dialog"]')
		)
			return;
		const rows = [...(list?.querySelectorAll<HTMLAnchorElement>('a.hit') ?? [])];
		if (event.key === 'Escape' && selected) {
			event.preventDefault();
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- `inbox` is resolved above
			goto(inbox).then(() => rows.find((row) => row.dataset.post === selected)?.focus());
			return;
		}
		const step = { j: 1, ArrowDown: 1, k: -1, ArrowUp: -1 }[event.key];
		if (!step || rows.length === 0) return;
		event.preventDefault();
		const from = rows.indexOf(document.activeElement as HTMLAnchorElement);
		const start = from === -1 ? rows.findIndex((row) => row.dataset.post === selected) : from;
		const next = start === -1 ? 0 : Math.min(Math.max(start + step, 0), rows.length - 1);
		rows[next].focus();
		rows[next].scrollIntoView({ block: 'nearest' });
	}

	// The titlebar holds the inbox's own views. The strip under the small-screen bar adds
	// Activity, which wide screens reach from the sidebar, as Campsite does below 1024px.
	const views = $derived(
		data.tabs.map((tab) => ({
			href: `${resolve('/inbox')}?tab=${tab}`,
			label: s.inbox.tabs[tab],
			current: tab === data.tab
		}))
	);
	const stripViews = $derived([
		...views,
		{ href: resolve('/activity'), label: s.nav.activity, current: false }
	]);

	const groups = $derived.by(() => {
		const out: { key: string; label: string; items: Item[] }[] = [];
		for (const item of items) {
			const at = new Date(item.createdAt);
			const key = calendarDay(at, data.timeZone);
			const last = out[out.length - 1];
			if (last?.key === key) last.items.push(item);
			else out.push({ key, label: posts.feed.day(at, data.timeZone), items: [item] });
		}
		return out;
	});
</script>

<svelte:head>
	<title>{s.inbox.title} · {core.appName}</title>
</svelte:head>

<!-- Mark read and Archive, as menu items for the touch "…" menu. -->
{#snippet triageItems(item: Item)}
	{#if item.kind === 'follow_up'}
		<form method="POST" action="/inbox?/finishReminder" use:enhance={triage}>
			<input type="hidden" name="item" value={item.itemKey} />
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<button {...props} type="submit">
						<Icon name="alarm-check" />
						{s.inbox.done}
					</button>
				{/snippet}
			</DropdownMenu.Item>
		</form>
	{/if}
	{#if item.kind === 'feedback'}
		<form method="POST" action="/inbox?/dismissFeedback" use:enhance={triage}>
			<input type="hidden" name="item" value={item.itemKey} />
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<button {...props} type="submit">
						<Icon name="close" />
						{s.inbox.dismiss}
					</button>
				{/snippet}
			</DropdownMenu.Item>
		</form>
	{/if}
	{#if unread}
		<form method="POST" action="/inbox?/read" use:enhance={triage}>
			<input type="hidden" name="item" value={item.itemKey} />
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<button {...props} type="submit">
						<Icon name="check" />
						{s.inbox.markRead}
					</button>
				{/snippet}
			</DropdownMenu.Item>
		</form>
	{/if}
	{#if data.tab !== 'archived'}
		<form method="POST" action="/inbox?/archive" use:enhance={triage}>
			<input type="hidden" name="item" value={item.itemKey} />
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<button {...props} type="submit">
						<Icon name="archive" />
						{s.inbox.archive}
					</button>
				{/snippet}
			</DropdownMenu.Item>
		</form>
	{/if}
{/snippet}

<svelte:window {onkeydown} />

<div class="split" data-open={selected ? '' : undefined}>
	<section class="list-column" bind:this={list}>
		<!-- Campsite's inbox titlebar: the views at the start, the "…" bulk menu at the end. -->
		<PageHeader title={s.inbox.title} titleHidden>
			{#snippet tools()}<ViewTabs label={s.inbox.tabsLabel} {views} place="bar" />{/snippet}
			{#snippet actions()}
				<IconButton href={resolve('/follow-ups')} icon="alarm" label={s.inbox.reminders} />
				{#if unread && items.length > 0}
					<Menu align="end" minWidth="15.625rem">
						{#snippet trigger({ props })}
							<IconButton {...props} icon="dots-horizontal" label={core.actions.more} />
						{/snippet}
						<form method="POST" action="/inbox?/readAll" use:enhance={stay}>
							<DropdownMenu.Item>
								{#snippet child({ props })}
									<button {...props} type="submit">
										<Icon name="mark-all-read" />
										{s.inbox.markAllRead}
									</button>
								{/snippet}
							</DropdownMenu.Item>
						</form>
					</Menu>
				{/if}
			{/snippet}
		</PageHeader>
		<ViewTabs label={s.inbox.tabsLabel} views={stripViews} place="strip" />

		{#if items.length === 0}
			<div class="empty">
				<EmptyState title={s.inbox.empty[data.tab]}>
					{#snippet icon()}
						<span class="empty-mark"><Icon name="inbox" size={80} strokeWidth="1.5" /></span>
					{/snippet}
				</EmptyState>
			</div>
		{:else}
			<div class="scroll" {@attach preloadInView}>
				{#each groups as group (group.key)}
					<section aria-label={group.label}>
						<h2 class="day">{group.label}</h2>
						<ul role="list" class="rows">
							{#each group.items as item (item.itemKey)}
								{@const reason = reasons[item.kind]}
								{@const preview =
									item.preview ??
									(item.summary === null ? s.preview(item.kind, item.itemKey) : null)}
								<li
									class="row"
									data-unread={unread ? '' : undefined}
									data-pending={opening === hrefOf(item) || undefined}
									data-active={(item.postId && item.postId === selected) || undefined}
								>
									<!-- eslint-disable svelte/no-navigation-without-resolve -- stored or resolved URLs -->
									<a
										class="hit"
										href={hrefOf(item)}
										data-post={item.postId}
										aria-current={(item.postId && item.postId === selected && 'page') || undefined}
										data-focus="inset"
									>
										<span class="u:visually-hidden"
											>{item.summary ?? s.line(item.actorName, item.kind, item.itemKey)}</span
										>
									</a>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
									{#if item.kind === 'reaction' && item.emoji}
										<!-- Campsite shows the emoji itself where the avatar would be. Reactions made before it was stored have none. -->
										<span class="mark" data-mark="emoji"
											><Emoji value={item.emoji} customEmoji={data.orgEmoji!.custom} /></span
										>
									{:else if item.kind === 'follow_up'}
										<span class="mark" data-mark="alarm"><Icon name="alarm" size={24} /></span>
									{:else}
										<ReasonAvatar name={item.actorName} icon={reason.icon} tone={reason.tone} />
									{/if}
									<div class="text">
										<div class="context">
											<!-- Campsite names the place: the post's project, with a lock when it's private. -->
											<span class="place">
												<span class="what">{item.place?.name ?? item.actorName}</span>
												{#if item.place?.private}<Icon name="lock" size={14} />{/if}
											</span>
											<span class="when">
												<time
													datetime={new Date(item.createdAt).toISOString()}
													title={time.long(item.createdAt, data.timeZone)}
												>
													{time.short(item.createdAt, data.timeZone)}
												</time>
												{#if canTriage}
													<!-- No hover on a touchscreen, so Campsite puts one "…" after the time. -->
													<span class="touch-menu">
														{#if item.kind === 'follow_up'}
															<RemindMe
																action="/inbox?/snoozeReminder"
																fields={{ item: item.itemKey }}
																label={s.inbox.snooze}
																variant="icon"
																size="sm"
															/>
														{/if}
														<Menu align="end">
															{#snippet trigger({ props })}
																<IconButton
																	{...props}
																	icon="dots-horizontal"
																	label={core.actions.more}
																	size="sm"
																	quiet
																/>
															{/snippet}
															{@render triageItems(item)}
														</Menu>
													</span>
												{/if}
											</span>
										</div>
										<div class="title">
											{#if unread}<span class="dot" aria-hidden="true"></span>{/if}
											<span class="title-text"
												>{item.summary ??
													item.title ??
													s.line(item.actorName, item.kind, item.itemKey)}</span
											>
											{#if item.count > 1}
												<span class="more">{s.detail(null, item.count - 1)}</span>
											{/if}
										</div>
										{#if preview}<p class="preview">{preview}</p>{/if}
										{#if item.held}<p class="held">{s.inbox.held}</p>{/if}
									</div>
									{#if canTriage}
										<div class="actions">
											{#if item.kind === 'feedback'}
												<form method="POST" action="/inbox?/dismissFeedback" use:enhance={triage}>
													<input type="hidden" name="item" value={item.itemKey} />
													<IconButton type="submit" icon="close" label={s.inbox.dismiss} quiet />
												</form>
											{/if}
											{#if item.kind === 'follow_up'}
												<form method="POST" action="/inbox?/finishReminder" use:enhance={triage}>
													<input type="hidden" name="item" value={item.itemKey} />
													<IconButton type="submit" icon="alarm-check" label={s.inbox.done} quiet />
												</form>
												<RemindMe
													action="/inbox?/snoozeReminder"
													fields={{ item: item.itemKey }}
													label={s.inbox.snooze}
													variant="icon"
												/>
											{/if}
											{#if unread}
												<form method="POST" action="/inbox?/read" use:enhance={triage}>
													<input type="hidden" name="item" value={item.itemKey} />
													<IconButton type="submit" icon="check" label={s.inbox.markRead} quiet />
												</form>
											{/if}
											{#if data.tab !== 'archived'}
												<form method="POST" action="/inbox?/archive" use:enhance={triage}>
													<input type="hidden" name="item" value={item.itemKey} />
													<IconButton type="submit" icon="archive" label={s.inbox.archive} quiet />
												</form>
											{/if}
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		{/if}
	</section>
	<div class="detail">{@render children()}</div>
</div>

<style>
	/* Campsite's inbox: a list column of 30% (350–600px) beside a detail pane, from 1024px up. */
	.split {
		display: flex;
		flex: 1;
		min-block-size: 0;
	}

	.list-column {
		display: flex;
		flex-direction: column;
		inline-size: 100%;
	}

	.detail {
		display: none;
		flex-direction: column;
		min-inline-size: 0;
	}

	/* A post opened at this address on a phone: the post alone, as on its own page. */
	.split[data-open] .list-column {
		display: none;
	}

	.split[data-open] .detail {
		display: flex;
		flex: 1;
	}

	/* The list keeps its own scroll beside the pane, as the chat list does. */
	@media (min-width: 64rem) {
		.list-column,
		.split[data-open] .list-column {
			position: sticky;
			inset-block-start: 0;
			display: flex;
			flex: 0 0 30%;
			align-self: flex-start;
			min-inline-size: 22rem;
			max-inline-size: 37.5rem;
			block-size: 100dvb;
			overflow-y: auto;
			overscroll-behavior: contain;
			border-inline-end: var(--border-w-hairline) solid var(--hue-z0-border);
		}

		.detail {
			display: flex;
			flex: 1;
		}
	}

	/* Campsite's empty inbox is its 80px inbox mark in the lightest grey, centred in the
	   column. Campfire keeps the one line under it, so people can read why the view is empty. */
	.empty {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
	}

	.empty-mark {
		display: flex;
		color: light-dark(var(--hue-gray-300), var(--hue-gray-700));
	}

	.day {
		position: sticky;
		inset-block-start: var(--header-h);
		z-index: 1;
		display: flex;
		align-items: center;
		block-size: 2.5rem;
		margin: 0;
		padding-inline: var(--gap-md);
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
		background-color: var(--hue-z0-bg);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
	}

	.rows {
		display: grid;
		gap: 1px;
		margin: 0;
		padding: var(--gap-sm);
		list-style: none;
	}

	.row {
		position: relative;
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		min-block-size: 3rem;
		padding: 0.625rem;
		border-radius: var(--radius-surface);
		container-type: inline-size;
	}

	.row:hover,
	.row:has(.hit:focus-visible),
	.row[data-active] {
		background-color: light-dark(var(--hue-gray-100), var(--hue-gray-800));
	}

	/* The row open in the pane, as Campsite marks it: bg-tertiary, bg-quaternary on hover. */
	.row[data-active]:hover {
		background-color: var(--hue-selected);
	}

	.row:has(> .hit:active),
	.row[data-pending] {
		background-color: var(--hue-pressed);
	}

	.hit {
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}

	/* Campsite's reaction and follow-up rows put a 24px mark where the avatar would be. */
	.mark {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		align-self: flex-start;
		margin-block-start: 2px;
		inline-size: 1.5rem;
		block-size: 1.5rem;
		font-size: 1.375rem;
		line-height: 1.5rem;
		color: var(--hue-text-secondary);
		pointer-events: none;
	}

	.text {
		display: grid;
		flex: 1;
		gap: 2px;
		min-inline-size: 0;
		pointer-events: none;
	}

	.context,
	.title {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		block-size: 1.25rem;
		min-inline-size: 0;
		font-size: var(--type-body);
		line-height: 1.25rem;
	}

	.context {
		justify-content: space-between;
		/* Campsite drops read rows to its quaternary grey (2.5:1). Campfire keeps every line of
		   text at 4.5:1 or better, so read rows step down by weight and the missing dot. */
		color: var(--hue-z0-muted);
	}

	.place {
		display: flex;
		gap: var(--gap-xs);
		align-items: center;
		min-inline-size: 0;
	}

	.place :global(.icon) {
		flex: none;
		opacity: 0.8;
	}

	.what {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@container (min-width: 36rem) {
		.what {
			font-size: var(--type-caption);
		}
	}

	.when {
		display: flex;
		flex: none;
		gap: var(--gap-xs);
		align-items: center;
	}

	time {
		color: var(--hue-z0-muted);
	}

	.title {
		gap: 0;
		color: var(--hue-z0-muted);
	}

	.row[data-unread] .title {
		color: var(--hue-z0-fg);
		font-weight: var(--fw-semibold);
	}

	.dot {
		flex: none;
		inline-size: 0.625rem;
		block-size: 0.625rem;
		margin-inline-end: 0.375rem;
		border-radius: var(--radius-full);
		background-color: var(--hue-unread);
	}

	.title-text {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.more {
		flex: none;
		margin-inline-start: var(--gap-sm);
		color: var(--hue-unread);
		font-weight: var(--fw-medium);
	}

	/* Triage on hover, as Campsite's row actions: a small raised bar over the row's end, so the
	   row keeps its full width at rest. */
	.actions {
		position: absolute;
		inset-block-start: 50%;
		inset-inline-end: var(--gap-sm);
		display: flex;
		gap: 2px;
		padding: 2px;
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-surface);
		background-color: var(--hue-z2-bg);
		box-shadow: var(--shadow-card);
		opacity: 0;
		translate: 0 -50%;
		transition: opacity var(--motion-fast) var(--motion-ease);
	}

	/* An open snooze menu keeps the actions shown. Its trigger is another component's element,
	   so the state check is global. */
	.row:hover .actions,
	.row:focus-within .actions,
	.actions:has(:global([data-state='open'])) {
		opacity: 1;
	}

	.actions form {
		display: contents;
	}

	/* The touch "…" sits in the context line, over the row's link, so it takes taps itself.
	   Its -3px margins keep the 26px button inside the 20px line without moving the time. */
	.touch-menu {
		position: relative;
		z-index: 1;
		display: none;
		margin-block: -0.1875rem;
		margin-inline-end: calc(var(--gap-xs) * -1);
		pointer-events: auto;
	}

	@media (hover: none) and (pointer: coarse) {
		.actions {
			display: none;
		}

		.touch-menu {
			display: flex;
		}
	}

	.preview {
		margin: 0;
		overflow: hidden;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: 1.25rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.scroll {
		flex: 1;
	}

	/* One quiet line: this notification was made while a schedule held push and email. */
	.held {
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		line-height: 1rem;
	}
</style>
