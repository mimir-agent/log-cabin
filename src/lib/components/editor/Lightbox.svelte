<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import { editor } from '#lib/strings/editor.js';

	type Props = {
		images: { src: string; alt: string }[];
		/** The image shown, or null while closed. */
		index: number | null;
		onchange: (index: number | null) => void;
		/** Draws the image instead of a plain <img>, e.g. with comments pinned to it. */
		image?: Snippet<[{ src: string; alt: string }]>;
	};
	const { images, index, onchange, image: draw }: Props = $props();
	const s = editor.gallery;
	const image = $derived(index === null ? null : images[index]);

	const step = (by: number) => onchange((index! + by + images.length) % images.length);

	function keydown(event: KeyboardEvent) {
		// Arrows move the caret in a comment being written over the image, not the image.
		if (event.target instanceof HTMLElement && event.target.isContentEditable) return;
		if (event.key === 'ArrowRight') step(1);
		else if (event.key === 'ArrowLeft') step(-1);
		else return;
		event.preventDefault();
	}
</script>

<!-- After Campsite's attachment viewer: the image on a dark full-screen backdrop, where it is
     and Close along the top, and round previous and next buttons at the sides. -->
<Dialog.Root open={index !== null} onOpenChange={(open) => open || onchange(null)}>
	<Dialog.Portal>
		<Dialog.Overlay>
			{#snippet child({ props })}<div {...props} class="overlay"></div>{/snippet}
		</Dialog.Overlay>
		<Dialog.Content>
			{#snippet child({ props })}
				<div {...props} class="lightbox" data-theme="dark" onkeydown={keydown}>
					<Dialog.Title class="u:visually-hidden">{s.lightbox}</Dialog.Title>
					<div class="bar">
						{#if images.length > 1}
							<span aria-live="polite">{s.position(index! + 1, images.length)}</span>
						{/if}
						<Dialog.Close>
							{#snippet child({ props })}
								<IconButton {...props} icon="close" label={s.close} size="lg" round />
							{/snippet}
						</Dialog.Close>
					</div>
					{#if images.length > 1}
						<span class="previous">
							<IconButton
								icon="chevron-left"
								label={s.previous}
								size="lg"
								round
								onclick={() => step(-1)}
							/>
						</span>
					{/if}
					{#if image && draw}
						<div class="drawn">{@render draw(image)}</div>
					{:else if image}
						<img src={image.src} alt={image.alt} />
					{/if}
					{#if images.length > 1}
						<span class="next">
							<IconButton
								icon="chevron-right"
								label={s.next}
								size="lg"
								round
								onclick={() => step(1)}
							/>
						</span>
					{/if}
				</div>
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.overlay {
		position: fixed;
		z-index: var(--z-modal);
		inset: 0;
		background-color: var(--hue-media-bg);
	}

	.lightbox {
		position: fixed;
		z-index: var(--z-modal);
		inset: 0;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		grid-template-rows: auto minmax(0, 1fr);
		grid-template-areas:
			'bar bar bar'
			'previous image next';
		gap: var(--gap-md);
		align-items: center;
		padding: max(var(--gap-md), env(safe-area-inset-top))
			max(var(--gap-md), env(safe-area-inset-right)) max(var(--gap-md), env(safe-area-inset-bottom))
			max(var(--gap-md), env(safe-area-inset-left));
		color: var(--hue-z0-fg);
	}

	.bar {
		grid-area: bar;
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		justify-content: flex-end;
		font-size: var(--type-body);
		font-variant-numeric: tabular-nums;
	}

	.previous {
		grid-area: previous;
	}

	.next {
		grid-area: next;
	}

	img {
		grid-area: image;
		justify-self: center;
		max-inline-size: 100%;
		max-block-size: 100%;
		border-radius: var(--radius-control);
		object-fit: contain;
	}

	/* A drawn image keeps its own layout and scrolls when it, and what it holds, is taller. */
	.drawn {
		grid-area: image;
		justify-self: center;
		max-block-size: 100%;
		overflow: auto;
	}
</style>
