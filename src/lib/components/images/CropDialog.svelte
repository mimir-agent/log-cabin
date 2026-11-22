<script lang="ts">
	import Banner from '#lib/components/ui/Banner.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Slider from '#lib/components/ui/Slider.svelte';
	import {
		cropEncoding,
		cropRect,
		cropShapes,
		dragView,
		maxZoom,
		renderCrop,
		type CropShape,
		type CropView
	} from '#lib/images/crop.js';
	import { people } from '#lib/strings/people.js';

	type Props = {
		/** The picked file; the dialog is open while there is one. */
		file: File | null;
		shape: CropShape;
		oncrop: (cropped: File) => void;
		oncancel: () => void;
	};

	let { file, shape, oncrop, oncancel }: Props = $props();
	const s = people.crop;
	const { aspect, output } = $derived(cropShapes[shape]);

	let image = $state<HTMLImageElement | null>(null);
	let error = $state('');
	let view = $state<CropView>({ centerX: 0.5, centerY: 0.5, zoom: 1 });
	let frameWidth = $state(0);
	let drag: { x: number; y: number } | null = null;

	$effect(() => {
		if (!file) return;
		const url = URL.createObjectURL(file);
		const loading = new Image();
		loading.onload = () => (image = loading);
		loading.onerror = () => (error = s.errors.unreadable);
		loading.src = url;
		view = { centerX: 0.5, centerY: 0.5, zoom: 1 };
		error = '';
		return () => {
			URL.revokeObjectURL(url);
			image = null;
		};
	});

	const size = $derived(image && { width: image.naturalWidth, height: image.naturalHeight });
	const rect = $derived(size && cropRect(size, aspect, view));
	// The image, scaled and shifted so the frame shows exactly `rect`.
	const scale = $derived(rect && frameWidth ? frameWidth / rect.width : 0);

	function move(event: PointerEvent) {
		if (!drag || !size) return;
		view = dragView(size, aspect, view, event.clientX - drag.x, event.clientY - drag.y, frameWidth);
		drag = { x: event.clientX, y: event.clientY };
	}

	async function save() {
		if (!file || !image || !rect) return;
		const blob = await renderCrop(image, rect, output, cropEncoding(shape, file.type));
		const extension = blob.type.split('/')[1];
		oncrop(
			new File([blob], `${file.name.replace(/\.[^.]*$/, '')}.${extension}`, { type: blob.type })
		);
	}
</script>

<Dialog
	open={file !== null}
	title={s.title}
	description={s.description}
	size="lg"
	onOpenChange={(open) => !open && oncancel()}
>
	<div
		class="frame"
		style:--aspect={aspect}
		bind:clientWidth={frameWidth}
		data-shape={shape}
		role="presentation"
		onpointerdown={(e) => {
			drag = { x: e.clientX, y: e.clientY };
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		}}
		onpointermove={move}
		onpointerup={() => (drag = null)}
	>
		{#if image && rect && size}
			<img
				src={image.src}
				alt=""
				draggable="false"
				style:inline-size="{size.width * scale}px"
				style:translate="{-rect.x * scale}px {-rect.y * scale}px"
			/>
		{/if}
	</div>
	{#if error}<Banner tone="danger">{error}</Banner>{/if}
	<div class="zoom">
		<span aria-hidden="true">{s.zoom}</span>
		<Slider label={s.zoom} min={1} max={maxZoom} step={0.01} bind:value={view.zoom} />
	</div>
	{#snippet actions()}
		<Button onclick={oncancel}>{s.cancel}</Button>
		<Button variant="primary" onclick={save} disabled={!image}>{s.save}</Button>
	{/snippet}
</Dialog>

<style>
	.frame {
		position: relative;
		/* As wide as the dialog, but never so tall that the slider and buttons scroll away. */
		inline-size: min(100%, calc(55dvh * var(--aspect)));
		aspect-ratio: var(--aspect);
		margin-inline: auto;
		overflow: hidden;
		border-radius: var(--radius-surface);
		background-color: var(--hue-z1-bg);
		cursor: grab;
		touch-action: none;
	}

	.frame:active {
		cursor: grabbing;
	}

	.frame img {
		position: absolute;
		inset-block-start: 0;
		inset-inline-start: 0;
		max-inline-size: none;
		block-size: auto;
		user-select: none;
	}

	/* A round avatar is cropped square; the ring shows how it will look. */
	.frame[data-shape='avatar']::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 50%;
		box-shadow: 0 0 0 100vmax color-mix(in oklch, var(--hue-backdrop) 60%, transparent);
		pointer-events: none;
	}

	.zoom {
		display: flex;
		align-items: center;
		gap: var(--gap-md);
	}
</style>
