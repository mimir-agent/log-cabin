<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Thread/Bubble/AttachmentCard/LottieAttachment.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
A Lottie animation (a JSON file) played in place, after Campsite's Lottie component (CC BY-NC 4.0),
with lottie-web (MIT). A JSON file that isn't an animation is a file card, like any other file.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import FileCard from '#lib/components/chat/FileCard.svelte';
	import { chat } from '#lib/strings/chat.js';

	let { file, src }: { file: { name: string; size: number }; src: string } = $props();

	let stage = $state<HTMLElement>();
	// Until the file is read, and if it turns out to be no animation, the card shows.
	let playing = $state(false);

	$effect(() => {
		const target = stage!;
		let animation: { destroy(): void } | undefined;
		let stale = false;
		(async () => {
			// The light build: the full one evaluates a layer's expression strings as JavaScript,
			// so an uploaded animation could run script in a reader's page.
			const [{ default: lottie }, response] = await Promise.all([
				import('lottie-web/build/player/lottie_light'),
				fetch(src)
			]);
			const data: { layers?: unknown } | null = await response.json();
			// A Lottie animation always has its layers.
			if (stale || !Array.isArray(data?.layers)) return;
			playing = true;
			await tick();
			if (stale) return;
			animation = lottie.loadAnimation({
				container: target,
				renderer: 'svg',
				loop: true,
				autoplay: true,
				animationData: data
			});
		})();
		return () => {
			stale = true;
			animation?.destroy();
		};
	});
</script>

<div
	class="stage"
	role="img"
	aria-label={chat.files.animation(file.name)}
	hidden={!playing}
	bind:this={stage}
></div>
{#if !playing}<FileCard {file} {src} />{/if}

<style>
	.stage {
		inline-size: 100%;
		border-radius: var(--radius-surface);
		background-color: var(--hue-z1-bg);
		overflow: hidden;
	}
</style>
