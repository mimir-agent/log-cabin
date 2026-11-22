<script lang="ts">
	import { page } from '$app/state';
	import CallSummary from '#lib/components/calls/CallSummary.svelte';
	import RecordingList from '#lib/components/calls/RecordingList.svelte';
	import FacePile from '#lib/components/ui/FacePile.svelte';
	import type { RecordingsView } from '#lib/server/recordings/view.js';
	import { calls } from '#lib/strings/calls.js';
	import { time } from '#lib/strings/time.js';

	type Props = {
		callId: string;
		title: string;
		startedAt: number;
		durationMs: number;
		/** Everyone who was in the call. */
		names: string[];
		recording: RecordingsView;
	};
	const { callId, title, startedAt, durationMs, names, recording }: Props = $props();
	const s = calls.index;
	let recordings = $state<RecordingList>();
</script>

<!-- A call that is over, as Campsite's call page shows it: when and how long, its title, what it
     was about, who was in it, then each recording with its transcript. -->
<article class="call">
	<p class="meta">
		<time datetime={new Date(startedAt).toISOString()}
			>{time.long(startedAt, page.data.timeZone)}</time
		>&ensp;·&ensp;{s.duration(durationMs)}
	</p>
	<!-- The page's heading above already says it; this is the same title, large, as Campsite sets it. -->
	<p class="title" aria-hidden="true">{title}</p>
	{#if recording.summary}<CallSummary
			summary={recording.summary}
			onseek={(lineId) => recordings!.seekToLine(lineId)}
		/>{/if}
	<div class="people">
		<FacePile
			people={names.map((name) => ({ id: name, name }))}
			limit={5}
			label={s.people(names)}
		/>
		<span>{s.people(names)}</span>
	</div>
	{#if recording.recordings.length}
		<RecordingList bind:this={recordings} {callId} view={recording} />
	{:else}
		<p class="meta">{calls.recording.notRecorded}</p>
	{/if}
</article>

<style>
	.call {
		display: grid;
		gap: var(--gap-lg);
		inline-size: 100%;
		max-inline-size: var(--measure);
		margin-inline: auto;
		padding: var(--gap-lg);
	}

	.meta {
		margin: 0;
		color: var(--hue-text-quaternary);
		font-size: var(--type-body);
	}

	.title {
		margin: 0;
		font-size: var(--type-display);
		font-weight: var(--fw-bold);
		line-height: var(--leading-tight);
		overflow-wrap: anywhere;
	}

	.people {
		display: flex;
		gap: var(--gap-sm);
		align-items: flex-start;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
	}
</style>
