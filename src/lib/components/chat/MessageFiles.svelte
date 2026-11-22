<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Thread/Bubble/AttachmentCard/index.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
A message's files, as cards beside its text after Campsite's AttachmentCard (Thread/Bubble,
CC BY-NC 4.0): images in a grid that opens the lightbox, a video in a player, audio in a
player, and any other file as a card with its name, size and a download link.
-->
<script lang="ts">
	import AppFile from '#lib/components/chat/AppFile.svelte';
	import FileCard from '#lib/components/chat/FileCard.svelte';
	import LottieFile from '#lib/components/chat/LottieFile.svelte';
	import RichText from '#lib/components/editor/RichText.svelte';
	import { attachmentPath, type DocNode } from '#lib/editor/doc.js';
	import { appFileKind } from '#lib/files.js';

	let {
		nodes,
		customEmoji,
		origin
	}: { nodes: DocNode[]; customEmoji: Record<string, string>; origin: string } = $props();

	type File = { id: string; name: string; size: number; contentType: string };
	const files = $derived(
		nodes.filter((n) => n.type === 'attachment').map((n) => n.attrs as unknown as File)
	);
	const images = $derived(nodes.filter((n) => n.type === 'image'));
	const kind = (file: File) => file.contentType.split('/')[0];
</script>

<div class="files">
	{#if images.length}
		<RichText doc={{ type: 'doc', content: images }} {customEmoji} compact />
	{/if}
	{#each files as file (file.id)}
		{@const src = attachmentPath(file.id)}
		{@const design = appFileKind(file.name)}
		{#if kind(file) === 'video'}
			<!-- A member's upload carries no captions. -->
			<!-- svelte-ignore a11y_media_has_caption -->
			<video class="media" controls preload="metadata" {src} aria-label={file.name}></video>
		{:else if kind(file) === 'audio'}
			<audio class="media" controls preload="metadata" {src} aria-label={file.name}></audio>
		{:else if design}
			<AppFile {file} {src} kind={design} {origin} />
		{:else if file.contentType === 'application/json'}
			<LottieFile {file} {src} />
		{:else}
			<FileCard {file} {src} />
		{/if}
	{/each}
</div>

<style>
	.files {
		display: grid;
		gap: var(--gap-xs);
		/* One width for every card, as Campsite's, so a run of files lines up. */
		inline-size: 18rem;
		max-inline-size: 100%;
	}

	.media {
		inline-size: 100%;
		border-radius: var(--radius-surface);
	}

	video.media {
		background-color: var(--hue-z1-bg);
	}
</style>
