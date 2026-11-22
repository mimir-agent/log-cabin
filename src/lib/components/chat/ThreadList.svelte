<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ThreadAvatar from './ThreadAvatar.svelte';
	import ThreadPreview from './ThreadPreview.svelte';
	import { chat as s } from '#lib/strings/chat.js';
	import { time } from '#lib/strings/time.js';
	import { preloadInView } from '#lib/preload.js';

	type Thread = {
		id: string;
		name: string;
		lastText: string | null;
		lastMessageAt: number | null;
		unread: number;
		/** Marked unread by hand: it shows as unread until opened. */
		markedUnread: boolean;
		group: boolean;
		faces: string[];
		pictureUrl: string | null;
	};

	type Props = {
		threads: Thread[];
		/** The thread open beside the list, if any. */
		selected?: string;
	};

	let { threads, selected }: Props = $props();
</script>

<!-- Campsite's thread inbox: rows 2px apart inside an 8px inset, a 40px face, the name at 15px
     medium over one line of the last message, the time, and a blue dot while unread. The open
     thread keeps a soft fill so the list says where you are. -->
<ul role="list" class="list" {@attach preloadInView}>
	{#each threads as thread (thread.id)}
		{@const current = thread.id === selected}
		{@const unread = (thread.unread > 0 && !current) || thread.markedUnread}
		<li>
			{#snippet row({ props }: { props: Record<string, unknown> })}
				<a
					{...props}
					class="row"
					href={resolve('/chat/[id]', { id: thread.id })}
					aria-current={current ? 'page' : undefined}
					data-unread={unread || undefined}
				>
					<ThreadAvatar faces={thread.faces} group={thread.group} src={thread.pictureUrl} />
					<span class="text">
						<span class="name">{thread.name}</span>
						<span class="preview">{thread.lastText ?? s.list.noMessages}</span>
					</span>
					{#if unread}
						<span class="dot" aria-hidden="true"></span>
						<span class="u:visually-hidden"
							>{thread.unread > 0 ? s.list.unread(thread.unread) : s.list.markedUnread}</span
						>
					{/if}
					{#if thread.lastMessageAt}
						<time
							datetime={new Date(thread.lastMessageAt).toISOString()}
							title={time.long(thread.lastMessageAt, page.data.timeZone)}
							>{time.short(thread.lastMessageAt, page.data.timeZone)}</time
						>
					{/if}
				</a>
			{/snippet}
			<!-- The open thread is beside the list already; the others preview on hover. -->
			{#if current}
				{@render row({ props: {} })}
			{:else}
				<ThreadPreview threadId={thread.id} trigger={row} />
			{/if}
		</li>
	{/each}
</ul>

<style>
	.list {
		display: grid;
		gap: 0.125rem;
		margin: 0;
		padding: var(--gap-sm);
		list-style: none;
	}

	.row {
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		padding: var(--gap-md) var(--gap-lg) var(--gap-md) var(--gap-sm);
		border-radius: var(--radius-surface);
		color: var(--hue-z0-fg);
		text-decoration: none;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	.row:hover {
		background-color: var(--hue-hover);
	}

	.row[aria-current='page'] {
		background-color: var(--hue-selected);
	}

	.row:active {
		background-color: var(--hue-pressed);
		transition-duration: var(--motion-instant);
	}

	.text {
		display: grid;
		flex: 1;
		min-inline-size: 0;
	}

	.name,
	.preview {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.name {
		font-size: 0.9375rem;
		font-weight: var(--fw-medium);
		line-height: 1.25rem;
	}

	.preview {
		color: var(--hue-text-secondary);
		font-size: var(--type-body);
		line-height: 1.25rem;
	}

	.row[data-unread] .preview {
		color: var(--hue-z0-fg);
	}

	.dot {
		flex: none;
		inline-size: 0.625rem;
		block-size: 0.625rem;
		border-radius: var(--radius-full);
		background-color: var(--hue-unread);
	}

	time {
		flex: none;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		font-variant-numeric: tabular-nums;
	}
</style>
