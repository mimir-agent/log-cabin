<!--
@component
The frame every settings page sits in, after Campsite's UserSettingsPageWrapper and
OrgSettingsPageWrapper (CC BY-NC 4.0): a titlebar with the face or the org's mark beside the
name, in the middle; the page's sections as tabs under it; then the sections themselves in a
768px column, 32px apart.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import SubTabs from '#lib/components/shell/SubTabs.svelte';

	type Props = {
		title: string;
		/** Whose settings: the person's face, or the org's mark (square). */
		avatar: { name: string; src?: string | null; shape?: 'round' | 'square' };
		tabs: { href: string; label: string; current: boolean }[];
		children: Snippet;
	};

	let { title, avatar, tabs, children }: Props = $props();
</script>

<PageHeader {title} centered>
	{#snippet leading()}
		<Avatar name={avatar.name} src={avatar.src} size="sm" shape={avatar.shape ?? 'round'} />
	{/snippet}
</PageHeader>

{#if tabs.length > 1}
	<SubTabs label={title} {tabs} />
{/if}

<div class="settings">
	{@render children()}
</div>

<style>
	.settings {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--gap-2xl);
		inline-size: 100%;
		max-inline-size: 48rem;
		margin-inline: auto;
		padding: var(--gap-2xl) var(--gap-lg) 8rem;
	}

	@media (min-width: 64rem) {
		.settings {
			padding-inline: 0;
		}
	}
</style>
