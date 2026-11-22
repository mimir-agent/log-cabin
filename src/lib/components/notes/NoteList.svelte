<script lang="ts">
	import { resolve } from '$app/paths';
	import NoteCards from '#lib/components/notes/NoteCards.svelte';
	import NoteRows, { type ListedNote } from '#lib/components/notes/NoteRows.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { notes as strings } from '#lib/strings/notes.js';

	type Props = {
		/** The first page, from the page's load. */
		notes: ListedNote[];
		/** Where the second page starts; null when there is none. */
		next: string | null;
		/** What notes/list is asked for besides the cursor, as a query string. */
		query: string;
		sort: 'activity' | 'created';
		layout: 'list' | 'grid';
		showProject?: boolean;
	};

	let { notes, next, query, sort, layout, showProject = true }: Props = $props();
	const s = strings.list;

	// The pages after the first, appended as the end of the list scrolls into view. A new first
	// page (another filter, sort or search) starts the list over.
	let rows = $derived(notes);
	let cursor = $derived(next);
	let status = $state<'idle' | 'loading' | 'failed'>('idle');

	async function loadMore() {
		const from = cursor;
		if (!from || status === 'loading') return;
		status = 'loading';
		try {
			const res = await fetch(
				`${resolve('/notes/list')}?${query}&cursor=${encodeURIComponent(from)}`
			);
			if (!res.ok) throw new Error(`notes/list answered ${res.status} for cursor ${from}`);
			const page: { notes: ListedNote[]; next: string | null } = await res.json();
			status = 'idle';
			// The list started over while this page was on its way.
			if (cursor !== from) return;
			rows = [...rows, ...page.notes];
			cursor = page.next;
		} catch (e) {
			console.error(e);
			status = 'failed';
		}
	}

	// A new sentinel for each cursor, so a page too short to push it out of view still asks
	// for the next one.
	let sentinel: HTMLElement | undefined = $state();
	$effect(() => {
		if (!sentinel) return;
		const seen = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting) && status === 'idle') loadMore();
			},
			{ rootMargin: '400px' }
		);
		seen.observe(sentinel);
		return () => seen.disconnect();
	});
</script>

{#if layout === 'grid'}
	<NoteCards notes={rows} />
{:else}
	<NoteRows notes={rows} {sort} {showProject} />
{/if}

{#if cursor}
	{#key cursor}
		<div class="more" bind:this={sentinel} aria-live="polite">
			{#if status === 'failed'}
				<span>{s.loadFailed}</span>
				<Button variant="ghost" size="sm" onclick={loadMore}>{s.retry}</Button>
			{:else if status === 'loading'}
				{s.loadingMore}
			{/if}
		</div>
	{/key}
{/if}

<style>
	.more {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		justify-content: center;
		min-block-size: var(--control-h-md);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
	}
</style>
