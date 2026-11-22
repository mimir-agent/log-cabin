<script lang="ts">
	import { onDestroy } from 'svelte';
	import { invalidate } from '$app/navigation';
	import Banner from '#lib/components/ui/Banner.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { CompositeRecorder } from '#lib/calls/video-recorder.js';
	import type { RecordingsView } from '#lib/server/recordings/view.js';
	import { calls } from '#lib/strings/calls.js';

	type Props = {
		callId: string;
		view: RecordingsView;
		/** The element holding the call's video tiles, once this browser is in the call; only
		 *  then can it record the video. */
		stage?: HTMLElement;
		/** Everyone's audio in this browser, to mix into the video. */
		audio?: MediaStream[];
		onerror: (e: unknown) => void;
	};
	const { callId, view, stage, audio = [], onerror }: Props = $props();
	const s = calls.recording;
	let busy = $state(false);
	let video = $state<{ recordingId: string; recorder: CompositeRecorder } | null>(null);

	/** Says the video failed in words, and keeps the cause (the request that failed) for the console. */
	function videoFailed(cause: unknown) {
		console.error(cause);
		onerror(new Error(s.errors.failedVideo));
	}

	function stopVideo() {
		video?.recorder.stop().catch(videoFailed);
		video = null;
	}

	// The video stops when the recording stops, whoever stopped it, and when this browser
	// leaves the call, which takes the call's screen and this bar with it. It waits while
	// Record reloads the view, which only then shows the new recording.
	$effect(() => {
		if (video && !busy && view.active?.id !== video.recordingId) stopVideo();
	});
	onDestroy(stopVideo);

	$effect(() => video?.recorder.setAudio(audio));

	async function post(op: 'start' | 'stop') {
		const response = await fetch(`/calls/${callId}/recordings`, {
			method: 'POST',
			body: JSON.stringify({ op })
		});
		if (!response.ok) {
			// A refusal (403, 502) carries words for the person; a crash (500) carries none.
			const { message } = (await response.json().catch(() => ({}))) as { message?: string };
			console.error(
				`POST /calls/${callId}/recordings ${op}: expected 200, got ${response.status} ${message}`
			);
			throw new Error(response.status < 500 && message ? message : s.errors.failedToggle);
		}
		return (await response.json()) as { recordingId?: string };
	}

	async function record() {
		busy = true;
		try {
			const { recordingId } = await post('start');
			const recorder = await CompositeRecorder.start(
				`/calls/${callId}/recordings/${recordingId}/video`,
				stage!,
				videoFailed
			);
			video = { recordingId: recordingId!, recorder };
			await invalidate('call:room');
		} catch (e) {
			onerror(e);
		}
		busy = false;
	}

	async function stop() {
		busy = true;
		await post('stop').catch(onerror);
		await invalidate('call:room');
		busy = false;
	}
</script>

{#if view.active && stage}
	<!-- In the call: a pill, not a banner across the screen. The consent line stays on the
	     pre-join banner below. -->
	<div class="pill" role="status" title={video ? s.videoHere : s.banner(view.active.startedByName)}>
		<span class="dot" aria-hidden="true"></span>
		{s.pill}
		{#if view.canRecord}
			<Button size="sm" onclick={stop} disabled={busy} aria-label={s.stop}>{s.stopShort}</Button>
		{/if}
	</div>
{:else if view.active}
	<Banner tone="live">
		{s.banner(view.active.startedByName)}
		{#if video}<small>{s.videoHere}</small>{/if}
		{#snippet action()}
			{#if view.canRecord}
				<Button size="sm" onclick={stop} disabled={busy}>{s.stop}</Button>
			{/if}
		{/snippet}
	</Banner>
{:else if view.canRecord && stage}
	<div>
		<Button size="sm" onclick={record} disabled={busy}>{busy ? s.starting : s.start}</Button>
	</div>
{/if}

<style>
	/* Breathes slowly, like the banner's dot; reduced motion stops it. */
	.pill {
		display: inline-flex;
		align-self: center;
		gap: var(--gap-xs);
		align-items: center;
		padding: var(--gap-xs) var(--gap-xs) var(--gap-xs) var(--gap-sm);
		border: var(--border-w-hairline) solid var(--hue-z1-border);
		border-radius: var(--radius-full);
		background-color: var(--hue-z1-bg);
		color: var(--hue-z1-fg);
		font-size: var(--type-caption);
		font-weight: var(--fw-semibold);
	}

	.dot {
		flex: none;
		inline-size: 0.5rem;
		block-size: 0.5rem;
		border-radius: var(--radius-full);
		background-color: var(--hue-live);
		animation: breathe 2s var(--ease-in-out) infinite;
	}

	@keyframes breathe {
		50% {
			opacity: 0.35;
		}
	}
</style>
