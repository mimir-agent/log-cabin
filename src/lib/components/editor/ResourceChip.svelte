<!--
@component
A mentioned note, post or call, as Campsite's InlineResourceMentionRenderer draws it: the type's
icon, then the title, linking to its page. `target` is what this reader may see of it. Without
one the chip is a warning icon and the words for its kind, with no link and no title.
-->

<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { ResourceKind } from '#lib/editor/doc.js';
	import { editor as text } from '#lib/strings/editor.js';

	type Props = { kind: ResourceKind; target?: { title: string; url: string } };

	const { kind, target }: Props = $props();
	const icons = { post: 'post-filled', note: 'note-filled', call: 'video-camera-filled' } as const;
</script>

{#if target}
	<!-- A page of ours, whose path the server worked out with the title. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		class="resource-mention"
		href={target.url}
		aria-label={text.resourceMention.aria(text.resourceMention.kind[kind], target.title)}
	>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		<span class="type" data-kind={kind}><Icon name={icons[kind]} size={18} /></span>{target.title}
	</a>
{:else}
	<span class="resource-mention">
		<span class="type"><Icon name="warning-triangle" size={18} /></span>{text.resourceMention
			.unavailable[kind]}
	</span>
{/if}

<style>
	.type {
		display: inline-flex;
		vertical-align: text-bottom;
		padding-inline-end: var(--gap-xs);
		color: var(--hue-z0-muted);
	}

	.type[data-kind='note'] {
		color: var(--hue-blue-500);
	}

	.type[data-kind='call'] {
		color: var(--hue-call);
	}
</style>
