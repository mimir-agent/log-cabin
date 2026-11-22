<!--
@component
A face, a logo or a cover photo you can replace, after Campsite's AvatarUploader (CC BY-NC
4.0): the picture with a round pencil button on its lower edge. The pencil is the file input's
label; the picked file is cropped to the picture's shape and shows at once, before the form is
saved.
-->
<script lang="ts">
	import CroppingImageInput from '#lib/components/images/CroppingImageInput.svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import FieldError from './FieldError.svelte';

	type Props = {
		/** Whose picture, for the initials when there's none. */
		name: string;
		src?: string | null;
		/** A cover is 3:1 and as wide as its container. */
		shape?: 'round' | 'square' | 'cover';
		/** The form field the file goes in. */
		inputName: string;
		/** What it is, read out on the button: "Avatar", "Logo". */
		label: string;
		/** Why the picked image was refused, shown under it. */
		error?: string;
	};

	let { name, src, shape = 'round', inputName, label, error }: Props = $props();
	const errorId = $props.id();
	let preview: string | null = $state(null);
	const crop = { round: 'avatar', square: 'logo', cover: 'cover' } as const;
</script>

<div class="picker" data-shape={shape}>
	{#if shape === 'cover'}
		<div class="cover">
			{#if preview ?? src}<img src={preview ?? src} alt="" />{/if}
		</div>
	{:else}
		<Avatar {name} src={preview ?? src} size="xl" {shape} />
	{/if}
	<label class="edit" title={label}>
		<CroppingImageInput
			name={inputName}
			shape={crop[shape]}
			{label}
			onpreview={(url) => (preview = url)}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? errorId : undefined}
		/>
		<Icon name="pencil" size={16} />
	</label>
</div>
{#if error}<FieldError id={errorId} message={error} />{/if}

<style>
	.picker {
		position: relative;
		flex: none;
		align-self: flex-start;
		inline-size: fit-content;
	}

	.picker[data-shape='cover'] {
		align-self: stretch;
		inline-size: auto;
	}

	.cover {
		aspect-ratio: 3;
		overflow: hidden;
		border-radius: var(--radius-surface);
		background-color: var(--hue-z1-bg);
	}

	.cover img {
		display: block;
		inline-size: 100%;
		block-size: 100%;
		object-fit: cover;
	}

	.picker[data-shape='cover'] .edit {
		inset: auto var(--gap-sm) var(--gap-sm) auto;
	}

	/* Campsite's raised round button, sitting on the picture's lower right edge. */
	.edit {
		position: absolute;
		inset: auto -0.25rem -0.25rem auto;
		display: grid;
		place-items: center;
		inline-size: var(--control-h-sm);
		block-size: var(--control-h-sm);
		border-radius: var(--radius-full);
		background-color: light-dark(var(--hue-white), var(--hue-gray-750));
		box-shadow: var(--shadow-button);
		color: var(--hue-z0-fg);
		cursor: pointer;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	.edit:hover {
		background-color: light-dark(var(--hue-gray-50), var(--hue-gray-700));
	}

	.edit:has(:global(input:focus-visible)) {
		outline: var(--focus-ring-width) solid var(--hue-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}
</style>
