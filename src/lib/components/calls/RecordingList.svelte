<script lang="ts">
	import RecordingEntry from '#lib/components/calls/RecordingEntry.svelte';
	import type { RecordingsView } from '#lib/server/recordings/view.js';
	import { calls } from '#lib/strings/calls.js';

	type Props = { callId: string; view: Pick<RecordingsView, 'recordings'> };
	const { callId, view }: Props = $props();
	const s = calls.recording;
	const entries: Record<string, RecordingEntry> = {};

	/** Plays the recording that holds this transcript line from where the line starts. */
	export function seekToLine(lineId: string) {
		for (const recording of view.recordings) {
			const line = recording.lines.find((l) => l.id === lineId);
			if (line) return entries[recording.id].seek(line.startMs);
		}
		throw new Error(`No transcript line ${lineId} on this call's recordings.`);
	}
</script>

<section class="l:waterfall" aria-label={s.title}>
	<h2 class="u:type-title">{s.title}</h2>
	{#each view.recordings as recording (recording.id)}
		<RecordingEntry bind:this={entries[recording.id]} {callId} {recording} />
	{/each}
</section>

<style>
	/* The call page after the call (parity.md §4.5): one reading column, headings that step
	   down by weight and colour rather than size, a transcript whose times sit in their own
	   column so the words line up. */
	section {
		inline-size: 100%;
		max-inline-size: var(--measure);
		margin-inline: auto;
	}

	h2 {
		margin: 0;
		font-weight: var(--fw-semibold);
	}
</style>
