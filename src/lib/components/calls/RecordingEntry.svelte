<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { mixSegments, wav } from '#lib/calls/audio.js';
	import type { RecordingsView } from '#lib/server/recordings/view.js';
	import { calls } from '#lib/strings/calls.js';
	import { time } from '#lib/strings/time.js';

	type Props = { callId: string; recording: RecordingsView['recordings'][number] };
	const { callId, recording }: Props = $props();
	const s = calls.recording;
	/** The mixed audio: an object URL once loaded, or why there is none yet. */
	let audio = $state<string | 'loading' | 'failed' | null>(null);
	let audioEl = $state<HTMLAudioElement>();
	let videoEl = $state<HTMLVideoElement>();
	let transcript = $state<HTMLElement>();
	/** Where the recording is, in ms, as of the last time its player reported. */
	let playedMs = $state(0);
	let currentVisible = $state(false);

	const audioTimeoutMs = 30_000;
	const base = `/calls/${callId}/recordings/${recording.id}`;
	const current = $derived(
		recording.lines.findLast((line) => line.startMs <= playedMs && playedMs < line.endMs)
	);
	const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

	/** Fetches every speaker's segments and mixes them into one file the browser can play. A
	 *  segment that hasn't arrived after `audioTimeoutMs` fails the load, and Try again reruns it. */
	async function loadAudio() {
		audio = 'loading';
		try {
			const segments = await Promise.all(
				recording.segments.map(async (segment) => {
					const response = await fetch(`${base}/audio/${segment.id}`, {
						signal: AbortSignal.timeout(audioTimeoutMs)
					});
					if (!response.ok) throw new Error(`segment ${segment.id}: ${response.status}`);
					return { startMs: segment.startMs, file: await response.arrayBuffer() };
				})
			);
			const file = wav(mixSegments(segments));
			audio = URL.createObjectURL(new Blob([file.slice()], { type: 'audio/wav' }));
		} catch (e) {
			console.error(`recording ${recording.id}: loading the audio failed`, e);
			audio = 'failed';
		}
	}

	/** Plays from `ms`: the video when there is one, otherwise the audio, loading it first. A
	 *  failed load leaves its message in place and plays nothing. */
	export async function seek(ms: number) {
		if (!recording.video && audio === null) await loadAudio();
		await tick();
		const player = videoEl ?? audioEl;
		if (!player) return;
		player.currentTime = ms / 1000;
		await player.play();
	}

	// The line being spoken stays in view only for someone already following along: if the
	// line before it was on screen, the new one is brought in. Anyone who has scrolled away is
	// left where they are, and Jump to current is there for them.
	$effect(() => {
		const line = current && transcript?.querySelector('[aria-current]');
		if (!line) return;
		if (untrack(() => currentVisible)) {
			line.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
		}
		const watch = new IntersectionObserver(([entry]) => (currentVisible = entry.isIntersecting));
		watch.observe(line);
		return () => watch.disconnect();
	});

	function jumpToCurrent() {
		transcript
			?.querySelector('[aria-current]')
			?.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
	}

	const track = (event: Event) =>
		(playedMs = (event.currentTarget as HTMLMediaElement).currentTime * 1000);
</script>

<article class="recording l:waterfall">
	<h3>{s.from(time.long(recording.startedAt, page.data.timeZone))}</h3>
	{#if s.status[recording.status]}<p class="muted">{s.status[recording.status]}</p>{/if}
	<h4>{s.video}</h4>
	{#if recording.video}
		<!-- The speaker-labelled transcript under the video stands in for captions. -->
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={videoEl}
			controls
			preload="metadata"
			src="{base}/video"
			ontimeupdate={track}
			onseeked={track}
		></video>
	{:else}
		<p class="muted">{s.noVideo}</p>
	{/if}
	{#if recording.segments.length}
		<h4>{s.audio}</h4>
		{#if audio && audio !== 'loading' && audio !== 'failed'}
			<audio bind:this={audioEl} controls src={audio} ontimeupdate={track} onseeked={track}></audio>
		{:else}
			{#if audio === 'failed'}<p class="problem" role="alert">{s.errors.audioFailed}</p>{/if}
			<div>
				<SuedeButton onclick={loadAudio} disabled={audio === 'loading'}>
					{audio === 'loading' ? s.loadingAudio : audio === 'failed' ? s.retryAudio : s.playAudio}
				</SuedeButton>
			</div>
		{/if}
	{/if}
	<h4>{s.transcript}</h4>
	{#if recording.lines.length}
		<p class="downloads">
			{s.download}
			{#each ['srt', 'vtt', 'txt'] as const as format (format)}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- a file for download, not a page -->
				<a
					href="{base}/transcript/{format}"
					download
					aria-label={s.downloadAs(s.downloadFormats[format])}>{s.downloadFormats[format]}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/each}
		</p>
		<div class="transcript" bind:this={transcript}>
			<ol>
				{#each recording.lines as line (line.id)}
					<li id="line-{line.id}" aria-current={line === current ? 'true' : undefined}>
						<button type="button" onclick={() => seek(line.startMs)}>
							<time class="muted">{s.at(line.startMs)}</time>
							<span class="turn"><strong>{line.speaker}</strong> {line.text}</span>
						</button>
					</li>
				{/each}
			</ol>
			{#if current && !currentVisible}
				<div class="jump">
					<SuedeButton onclick={jumpToCurrent}>{s.jumpToCurrent}</SuedeButton>
				</div>
			{/if}
		</div>
	{:else}
		<p class="muted">{s.noTranscript}</p>
	{/if}
</article>

<style>
	.recording {
		--waterfall-gap: var(--gap-sm);
		font-size: var(--type-body);
	}

	.recording + .recording {
		padding-block-start: var(--gap-lg);
		border-block-start: var(--border-w-hairline) solid var(--hue-z0-border);
	}

	h3 {
		margin: 0;
		font-size: var(--type-body);
		font-weight: var(--fw-semibold);
		line-height: var(--leading-tight);
	}

	h4 {
		margin: var(--gap-sm) 0 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
	}

	p {
		margin: 0;
	}

	video {
		inline-size: 100%;
		aspect-ratio: 16 / 9;
		border-radius: var(--radius-surface);
		background: var(--hue-media-bg);
	}

	audio {
		inline-size: 100%;
	}

	ol {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		margin-inline: calc(var(--gap-sm) * -1);
		border-radius: var(--radius-control);
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	/* A line is a button that looks like text: the time sits in its own column so the words
	   line up, and the words stay selectable. */
	li button {
		display: grid;
		grid-template-columns: 3.5rem minmax(0, 1fr);
		column-gap: var(--gap-sm);
		align-items: baseline;
		inline-size: 100%;
		padding: var(--gap-xs) var(--gap-sm);
		border: 0;
		border-radius: inherit;
		background: none;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;
		user-select: text;
	}

	/* The line being spoken: a pale fill, quieter than the one a citation lands on. */
	li[aria-current] {
		background: color-mix(in srgb, var(--hue-z0-border) 50%, transparent);
	}

	/* A citation lands here: the line it points at lights up in the accent's pale fill. */
	li:target {
		background: var(--hue-accent-subtle);
	}

	time {
		font-size: var(--type-caption);
		font-variant-numeric: tabular-nums;
	}

	.turn {
		font-size: var(--type-prose);
		line-height: var(--leading-loose);
		overflow-wrap: anywhere;
	}

	.turn strong {
		font-weight: var(--fw-medium);
	}

	.jump {
		position: sticky;
		inset-block-end: var(--gap-sm);
		display: flex;
		justify-content: center;
	}

	.muted {
		color: var(--hue-z0-muted);
	}

	.problem {
		color: var(--hue-danger);
	}
</style>
