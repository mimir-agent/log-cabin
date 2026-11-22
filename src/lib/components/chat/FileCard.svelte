<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/FileAttachment/index.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
A file as a card, after Campsite's FileAttachment (CC BY-NC 4.0): its icon, name and size. With
no `actions` the whole card is a link that downloads it; with them it holds its own buttons.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { editor as text } from '#lib/strings/editor.js';
	import { chat } from '#lib/strings/chat.js';

	type Props = { file: { name: string; size: number }; src: string; actions?: Snippet };

	let { file, src, actions }: Props = $props();
</script>

<!-- A file, not a page: resolve() is for routes. -->
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<svelte:element
	this={actions ? 'div' : 'a'}
	class="card"
	href={actions ? undefined : src}
	download={actions ? undefined : file.name}
>
	<span class="icon"><Icon name="file" size={24} /></span>
	<span class="name">{file.name}</span>
	<span class="size">{text.fileSize(file.size)}</span>
	{#if actions}
		<span class="get">{@render actions()}</span>
	{:else}
		<span class="u:visually-hidden">{chat.thread.download}</span>
		<span class="get"><Icon name="download" /></span>
	{/if}
</svelte:element>

<style>
	.card {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0 var(--gap-sm);
		align-items: center;
		padding: var(--gap-sm) var(--gap-md);
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-surface);
		background-color: var(--hue-z1-bg);
		color: var(--hue-z1-fg);
		text-decoration: none;
	}

	.icon {
		display: grid;
		grid-row: span 2;
	}

	.get {
		display: flex;
		grid-row: 1 / span 2;
		grid-column: 3;
	}

	a.card:hover {
		background-color: var(--hue-hover);
	}

	.name {
		overflow: hidden;
		font-weight: var(--fw-medium);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.size {
		grid-column: 2;
		color: var(--hue-z1-muted);
		font-size: var(--type-caption);
	}
</style>
