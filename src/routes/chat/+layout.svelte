<script lang="ts">
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import ThreadList from '#lib/components/chat/ThreadList.svelte';
	import { outgoing } from '#lib/components/chat/outgoing.svelte.js';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import { chat as s } from '#lib/strings/chat.js';
	import type { LayoutProps } from './$types';

	const { data, children }: LayoutProps = $props();
	// A message of yours still on its way already counts as its thread's last one.
	const threads = $derived(
		data.threads
			.map((thread) => {
				const last = outgoing.findLast((o) => o.threadId === thread.id);
				return last ? { ...thread, lastText: last.text, lastMessageAt: last.sentAt } : thread;
			})
			.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0))
	);
	// The thread being opened is selected from the moment it's chosen.
	const selected = $derived((navigating.to?.params ?? page.params).id);
	// A thread or the new-conversation form is open; on a phone that replaces the list.
	const open = $derived(page.route.id !== '/chat');
</script>

<!-- Campsite's chat: the thread list in a column of 40% (200–400px) beside the open thread,
     from 1024px up. Below that, the list and the thread take turns. -->
<div class="split" data-open={open || undefined}>
	<section class="list-column" aria-label={s.list.title}>
		<PageHeader title={s.list.title}>
			{#snippet actions()}
				<IconButton href={resolve('/chat/new')} icon="plus" label={s.list.newMessage} />
			{/snippet}
		</PageHeader>
		{#if threads.length === 0}
			<EmptyState title={s.list.empty} />
		{:else}
			<ThreadList {threads} {selected} />
		{/if}
	</section>
	<div class="detail">
		{@render children()}
	</div>
</div>

<style>
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

	.split[data-open] .list-column {
		display: none;
	}

	.split[data-open] .detail {
		display: flex;
		flex: 1;
	}

	@media (min-width: 64rem) {
		.list-column,
		.split[data-open] .list-column {
			position: sticky;
			inset-block-start: 0;
			display: flex;
			flex: 0 0 40%;
			align-self: flex-start;
			min-inline-size: 12.5rem;
			max-inline-size: 25rem;
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
</style>
