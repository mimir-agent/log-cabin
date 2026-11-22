<!--
@component
A file input for an image that opens the crop dialog once a file is picked, and swaps the
picked file for the crop. It draws nothing itself: wrap it in a `<label>`, or call `pick()`.
Without JavaScript the file goes as picked; the server checks its type and size either way.
-->
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import type { CropShape } from '#lib/images/crop.js';
	import CropDialog from './CropDialog.svelte';

	type Props = {
		/** The form field the cropped file is sent as. */
		name: string;
		shape: CropShape;
		label: string;
		/** A URL of the crop, to show before the form is saved. */
		onpreview: (url: string) => void;
		/** After the crop is in the input: a form that saves at once submits here. */
		oncrop?: (input: HTMLInputElement) => void;
	} & Pick<HTMLInputAttributes, 'aria-invalid' | 'aria-describedby'>;

	let { name, shape, label, onpreview, oncrop, ...aria }: Props = $props();

	let input: HTMLInputElement;
	let picked = $state<File | null>(null);
	let cropped: FileList | null = null;
	let preview: string | null = null;

	/** Opens the file picker. */
	export function pick() {
		input.click();
	}

	function crop(file: File) {
		const files = new DataTransfer();
		files.items.add(file);
		cropped = input.files = files.files;
		picked = null;
		if (preview) URL.revokeObjectURL(preview);
		preview = URL.createObjectURL(file);
		onpreview(preview);
		oncrop?.(input);
	}

	// Cancelling keeps the crop made before, if there was one.
	function cancel() {
		if (cropped) input.files = cropped;
		else input.value = '';
		picked = null;
	}

	$effect(() => () => {
		if (preview) URL.revokeObjectURL(preview);
	});
</script>

<input
	bind:this={input}
	class="u:visually-hidden"
	{name}
	type="file"
	accept="image/png,image/jpeg,image/gif,image/webp"
	aria-label={label}
	{...aria}
	onchange={() => (picked = input.files?.[0] ?? null)}
/>
<CropDialog file={picked} {shape} oncrop={crop} oncancel={cancel} />
