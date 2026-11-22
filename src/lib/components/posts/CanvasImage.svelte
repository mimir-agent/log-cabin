<script lang="ts">
	import CommentForm from './CommentForm.svelte';
	import { initials } from '#lib/components/shell/Avatar.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { posts } from '#lib/strings/posts.js';

	type Pin = { id: string; number: number; x: number; y: number; authorName: string; hue: string };
	type Props = {
		src: string;
		alt: string;
		attachmentId: string;
		/** Comments pinned to this image, numbered in the order they were made. */
		pins: Pin[];
		canPin: boolean;
		members: { id: string; name: string }[];
		/** The org's own emoji, for a comment shown the moment it's sent. */
		customEmoji: Record<string, string>;
		/** Where the comment box uploads files; without it the box has no attach button. */
		uploadUrl?: string;
		/** The viewer's person colour, for the marker they are placing. */
		viewerHue: string;
	};

	const {
		src,
		alt,
		attachmentId,
		pins,
		canPin,
		members,
		customEmoji,
		uploadUrl,
		viewerHue
	}: Props = $props();
	const s = posts.canvas;
	let placing = $state(false);
	let draft = $state<{ x: number; y: number } | null>(null);

	const clamp = (n: number) => Math.min(1, Math.max(0, n));
	const percent = (n: number) => `${n * 100}%`;

	function place(event: MouseEvent & { currentTarget: HTMLButtonElement }) {
		const box = event.currentTarget.getBoundingClientRect();
		// A keyboard press has no pointer position (detail is 0): pin to the middle instead.
		draft =
			event.detail === 0
				? { x: 0.5, y: 0.5 }
				: {
						x: clamp((event.clientX - box.left) / box.width),
						y: clamp((event.clientY - box.top) / box.height)
					};
	}

	function reset() {
		placing = false;
		draft = null;
	}
</script>

<figure class="canvas l:waterfall">
	<div class="frame">
		<img {src} {alt} loading="lazy" />
		{#if placing}
			<button type="button" class="surface" aria-label={s.placeHere} onclick={place}></button>
		{/if}
		{#each pins as pin (pin.id)}
			<a
				class="marker"
				id="pin-{pin.id}"
				href="#comment-{pin.id}"
				data-hue={pin.hue}
				style:--x={percent(pin.x)}
				style:--y={percent(pin.y)}
				aria-label={s.marker(pin.number, pin.authorName)}>{initials(pin.authorName)}</a
			>
		{/each}
		{#if draft}
			<span
				class="marker"
				data-draft
				data-hue={viewerHue}
				style:--x={percent(draft.x)}
				style:--y={percent(draft.y)}
				aria-hidden="true"
			></span>
		{/if}
	</div>
	{#if canPin}
		<figcaption>
			<Button size="sm" pressed={placing} onclick={() => (placing ? reset() : (placing = true))}>
				{placing ? s.stop : s.start}
			</Button>
			{#if placing && !draft}<span class="hint">{s.hint}</span>{/if}
		</figcaption>
		{#if draft}
			<CommentForm
				action="?/pin"
				pin={{ attachmentId, ...draft }}
				{members}
				{customEmoji}
				{uploadUrl}
				placeholder={s.placeholder}
				submitLabel={s.submit}
				oncancel={reset}
				onsaved={reset}
			/>
		{/if}
	{/if}
</figure>

<style>
	.canvas {
		--waterfall-gap: var(--gap-sm);
		margin: 0;
	}

	.frame {
		position: relative;
		inline-size: fit-content;
		max-inline-size: 100%;
	}

	img {
		display: block;
		max-inline-size: 100%;
	}

	.surface {
		position: absolute;
		inset: 0;
		border: 0;
		background: none;
		cursor: crosshair;
	}

	/* A round pin whose pointed bottom-left corner sits on the point. */
	.marker {
		position: absolute;
		inset-inline-start: var(--x);
		inset-block-start: var(--y);
		display: grid;
		place-items: center;
		inline-size: 1.5rem;
		block-size: 1.5rem;
		translate: 0 -100%;
		border-radius: 50% 50% 50% 0;
		background-color: var(--person);
		color: var(--person-fg);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
		text-decoration: none;
		pointer-events: auto;
	}

	.marker[data-draft] {
		pointer-events: none;
	}

	figcaption {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
	}
</style>
