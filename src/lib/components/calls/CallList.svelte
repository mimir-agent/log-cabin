<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ThreadAvatar from '#lib/components/chat/ThreadAvatar.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { calls as strings } from '#lib/strings/calls.js';
	import { posts } from '#lib/strings/posts.js';
	import { calendarDay } from '#lib/time-zone.js';

	type Call = {
		id: string;
		startedAt: number;
		durationMs: number;
		title: string | null;
		/** The start of the call's summary, as plain text. */
		preview: string | null;
		recorded: boolean;
		transcribed: boolean;
		/** Its recording is still being written, so it has no title yet. */
		processing: boolean;
		place: { name: string; href: string };
		names: string[];
	};

	type Props = {
		calls: Call[];
		/** The next page, as a query string; null on the last page. */
		more: string | null;
		empty: string;
		/** Names each row by where the call was. Off on a place's own calls tab. */
		showPlace?: boolean;
	};

	let { calls, more, empty, showPlace = true }: Props = $props();
	const s = strings.index;

	// The faces are everyone else who was in it, as Campsite's are; yours only on a call alone.
	const me = $derived(page.data.user?.name);
	function faces(names: string[]) {
		const others = names.filter((name) => name !== me);
		return (others.length ? others : names).slice(0, 3);
	}

	// Grouped by the day each call started, the order the list is sorted in.
	const groups = $derived.by(() => {
		const out: { key: string; label: string; items: Call[] }[] = [];
		for (const call of calls) {
			const at = new Date(call.startedAt);
			const key = calendarDay(at, page.data.timeZone);
			const last = out[out.length - 1];
			if (last?.key === key) last.items.push(call);
			else out.push({ key, label: posts.feed.day(at, page.data.timeZone), items: [call] });
		}
		return out;
	});
</script>

<!-- After Campsite's CallsIndex (CC BY-NC 4.0): calls under a day heading, each row the faces
     that were in it, a 15px title with the call's length beside it in the faintest grey, a quiet
     second line with the start of its summary (when and who for a call with none), and the
     channel it was in at the end. Each row opens the call's own page. -->
{#if calls.length === 0}
	<EmptyState title={empty} size="index">
		{#snippet icon()}<Icon name="video-camera" size={32} />{/snippet}
	</EmptyState>
{:else}
	<div class="groups">
		{#each groups as group (group.key)}
			<section aria-label={group.label}>
				<div class="day-heading" aria-hidden="true"><span>{group.label}</span></div>
				<ul class="rows" role="list">
					{#each group.items as call (call.id)}
						{@const shown = faces(call.names)}
						<li class="row">
							<ThreadAvatar faces={shown} group={shown.length > 1} />
							<div class="text">
								<p class="line">
									<a
										class="title"
										href={resolve('/calls/[id]', { id: call.id })}
										data-pending={call.processing && !call.title ? '' : undefined}
										>{call.processing && !call.title
											? s.processing
											: (call.title ?? (showPlace ? call.place.name : s.people(call.names)))}</a
									>
									<span class="length">{s.duration(call.durationMs)}</span>
									{#if call.recorded}
										<span class="mark" role="img" aria-label={s.recorded}
											><Icon name="video" size={16} /></span
										>
									{/if}
									{#if call.transcribed}
										<span class="mark" role="img" aria-label={s.transcribed}
											><Icon name="text-align-left" size={16} /></span
										>
									{/if}
								</p>
								<p class="meta">
									{#if call.preview}
										{call.preview}
									{:else}
										<time datetime={new Date(call.startedAt).toISOString()}
											>{s.time(call.startedAt, page.data.timeZone)}</time
										>{#if showPlace}&ensp;·&ensp;{s.people(call.names)}{/if}
									{/if}
								</p>
							</div>
							{#if showPlace && call.title}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the server builds the place's path -->
								<a class="place" href={call.place.href}>{call.place.name}</a>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
{/if}
{#if more}
	<!-- Callers pass the query of the next page. -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<p class="more"><a href={more}>{s.more}</a></p>
{/if}

<style>
	/* The gaps between days grow with the screen, 16 → 24 → 32px, as Campsite's do. */
	.groups {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--gap-lg);
	}

	@media (min-width: 48rem) {
		.groups {
			gap: 1.5rem;
		}
	}

	@media (min-width: 64rem) {
		.groups {
			gap: 2rem;
		}
	}

	.day-heading {
		display: flex;
		gap: var(--gap-lg);
		align-items: center;
		padding-block: var(--gap-sm);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		line-height: 1.25rem;
	}

	.day-heading::after {
		flex: 1;
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
		content: '';
	}

	.rows {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--gap-xs);
		margin: 0 calc(var(--gap-sm) * -1);
		padding: var(--gap-sm) 0;
		list-style: none;
	}

	/* Campsite's CallRow: 12px between the faces and the text, 10px above and below. The
	   title's link covers the whole row. */
	.row {
		position: relative;
		display: flex;
		gap: 0.75rem;
		align-items: center;
		padding: 0.625rem 0.5rem 0.625rem 0.75rem;
		border-radius: var(--radius-surface);
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	.row:hover {
		background-color: var(--hue-hover);
	}

	.row:has(.title:focus-visible) {
		outline: var(--focus-ring-width) solid var(--hue-focus-ring);
		outline-offset: calc(var(--focus-ring-width) * -1);
	}

	.text {
		display: grid;
		flex: 1;
		grid-template-columns: minmax(0, 1fr);
		min-inline-size: 0;
	}

	.line {
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1.375rem;
	}

	.title {
		overflow: hidden;
		min-inline-size: 0;
		color: var(--hue-z0-fg);
		font-weight: var(--fw-medium);
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.title:focus-visible {
		outline: none;
	}

	.title::after {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		content: '';
	}

	.title[data-pending] {
		color: var(--hue-z0-muted);
	}

	.length {
		flex: none;
		color: var(--hue-text-quaternary);
		font-variant-numeric: tabular-nums;
	}

	.mark {
		display: inline-flex;
		flex: none;
		align-self: center;
		color: var(--hue-text-quaternary);
	}

	/* Campsite's project tag: it sits above the row's link, so it opens the channel. */
	.place {
		position: relative;
		flex: none;
		max-inline-size: 10rem;
		overflow: hidden;
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.place:hover {
		color: var(--hue-z0-fg);
	}

	/* Campsite's summary line stops at 576px (max-w-xl), so it never reads as a paragraph. */
	.meta {
		overflow: hidden;
		max-inline-size: 36rem;
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: 1.25rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.more {
		padding-block: var(--gap-md);
		font-size: var(--type-body);
	}
</style>
