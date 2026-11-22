<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/ThreadView/ThreadHoverCard.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
A thread in the list that previews its last messages while the pointer rests on it, after
Campsite's ThreadHoverCard (CC BY-NC 4.0). The row is still a plain link that a click follows.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import HoverCard from '#lib/components/ui/HoverCard.svelte';
	import { chat as s } from '#lib/strings/chat.js';

	type Preview = {
		name: string;
		messages: { id: string; authorName: string; mine: boolean; text: string | null }[];
	};

	type Props = {
		threadId: string;
		/** The thread's row; spread `props` on its `<a>`. */
		trigger: Snippet<[{ props: Record<string, unknown> }]>;
	};

	let { threadId, trigger }: Props = $props();
	let preview = $state<Preview | null>(null);

	// Fetched on each opening, so it shows what was said since the last one.
	async function load(open: boolean) {
		if (!open) return;
		const response = await fetch(`/chat/${encodeURIComponent(threadId)}/preview`);
		if (response.ok) preview = await response.json();
	}
</script>

<HoverCard side="right" width="20rem" onOpenChange={load} {trigger}>
	{#if preview}
		<p class="name">{preview.name}</p>
		{#if preview.messages.length}
			<ol class="messages">
				{#each preview.messages as message (message.id)}
					<li data-mine={message.mine || undefined}>
						<span class="who">{message.authorName}</span>
						<span class="what">{message.text ?? s.thread.deleted}</span>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="what">{s.list.noMessages}</p>
		{/if}
	{/if}
</HoverCard>

<style>
	p {
		margin: 0;
	}

	.name {
		font-weight: var(--fw-semibold);
	}

	.messages {
		display: grid;
		gap: var(--gap-sm);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		font-size: var(--type-body);
	}

	.who {
		color: var(--hue-z1-muted);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
	}

	.what {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		overflow-wrap: anywhere;
	}
</style>
