<script lang="ts">
	import type { Snippet } from 'svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';

	type Props = { orgName: string | null; logoUrl: string | null; children: Snippet };

	const { orgName, logoUrl, children }: Props = $props();
</script>

<!-- A public page has no app chrome: only the org, then the content at reading width. -->
<header class="bar">
	{#if orgName}
		<Avatar name={orgName} src={logoUrl} size="sm" shape="square" />
		<span>{orgName}</span>
	{/if}
</header>
<main class="content">
	{@render children()}
</main>

<style>
	.bar {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-block-size: var(--control-h-lg);
		padding-inline: var(--gap-lg);
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
		font-weight: var(--fw-medium);
	}

	.content {
		max-inline-size: var(--column-post);
		margin-inline: auto;
		padding: var(--gap-2xl) var(--gap-lg);
	}
</style>
