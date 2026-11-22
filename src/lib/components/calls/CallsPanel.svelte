<script lang="ts">
	import { page } from '$app/state';
	import LiveCallRow from '#lib/components/calls/LiveCallRow.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { calls as strings } from '#lib/strings/calls.js';
	import { time } from '#lib/strings/time.js';

	type Props = {
		live: { id: string; names: string[] } | null;
		recent: { id: string; startedAt: number; durationMs: number; names: string[] }[];
	};

	let { live, recent }: Props = $props();
	const s = strings.place;
</script>

<!-- A place's calls: one happening now, and the last few as compact rows after Campsite's
     CompactCallRow (CC BY-NC 4.0). -->
{#if live || recent.length > 0}
	<section class="calls">
		{#if live}
			<LiveCallRow id={live.id} label={s.live(live.names)} />
		{/if}
		{#if recent.length > 0}
			<h2 class="heading">{s.recent}</h2>
			<ul class="recent" role="list">
				{#each recent as call (call.id)}
					<li>
						<Icon name="video-camera" size={20} />
						<span class="when"
							><time datetime={new Date(call.startedAt).toISOString()}
								>{time.long(call.startedAt, page.data.timeZone)}</time
							></span
						>
						<span class="who">{s.summary(Math.round(call.durationMs / 60_000), call.names)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.calls {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--gap-sm);
		margin-block-start: var(--gap-md);
		font-size: var(--type-body);
	}

	.heading {
		margin: var(--gap-sm) 0 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
	}

	.recent {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.recent li {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-block-size: 2rem;
		color: var(--hue-text-quaternary);
	}

	.when {
		flex: none;
		color: var(--hue-z0-fg);
		font-weight: var(--fw-medium);
	}

	.who {
		overflow: hidden;
		color: var(--hue-z0-muted);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
