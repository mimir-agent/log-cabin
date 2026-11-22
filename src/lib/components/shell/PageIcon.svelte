<!--
@component
A place's mark in the titlebar and on the phone home screen: a 24px squircle in the place's
colour with a white glyph, after Campsite's `SquircleIconContainer` (CC BY-NC 4.0). Posts are
ink, notes blue, calls green. Decorative: the label beside it names the place.
-->
<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';

	type Props = { tone: 'post' | 'note' | 'call' };

	const { tone }: Props = $props();
	const glyph = { post: 'post-filled', note: 'note-filled', call: 'video-camera-filled' } as const;
</script>

<span class="squircle" data-tone={tone} aria-hidden="true">
	<Icon name={glyph[tone]} size={tone === 'call' ? 16 : 20} />
</span>

<style>
	.squircle {
		display: grid;
		flex: none;
		place-items: center;
		inline-size: 1.5rem;
		block-size: 1.5rem;
		border-radius: 0.4375rem;
		color: var(--hue-white);
	}

	.squircle[data-tone='post'] {
		background-color: light-dark(var(--hue-gray-800), var(--hue-gray-700));
	}

	.squircle[data-tone='note'] {
		background-color: #3b82f6; /* Campsite's blue-500, the colour of Docs */
	}

	.squircle[data-tone='call'] {
		background-color: var(--hue-call); /* Campsite's green-500, the colour of Calls */
	}
</style>
