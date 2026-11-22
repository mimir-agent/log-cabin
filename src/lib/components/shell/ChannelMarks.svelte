<!--
@component
What a channel's name carries: a lock when it's private, Archived when it's archived. They sit
after the name in the page header, at every width.
-->
<script lang="ts">
	import { posts } from '#lib/strings/posts.js';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Badge from './Badge.svelte';

	type Props = { private: boolean; archived: boolean };

	let { private: isPrivate, archived }: Props = $props();
	const s = posts.projects;
</script>

{#if isPrivate}
	<span class="lock" title={s.privateBadge}>
		<Icon name="lock" size={16} />
		<span class="u:visually-hidden">{s.privateBadge}</span>
	</span>
{/if}
{#if archived}<Badge>{s.archivedBadge}</Badge>{/if}

<style>
	.lock {
		display: inline-flex;
		vertical-align: -3px;
		color: var(--hue-z0-muted);
	}
</style>
