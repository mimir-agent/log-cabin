<!-- What shows in place of a page that failed to load. A post or note that 404s says it was deleted. -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { core } from '#lib/strings/core.js';

	const s = core.errorPage;
	const route = $derived(page.status === 404 ? page.route.id : null);
	const gone = $derived(
		route?.startsWith('/posts/[id]')
			? { ...s.postGone, icon: 'post' as const }
			: route?.startsWith('/notes/[id]')
				? { ...s.noteGone, icon: 'note' as const }
				: null
	);
	const title = $derived(gone?.title ?? page.error?.message ?? String(page.status));
</script>

<svelte:head>
	<title>{title} · {core.appName}</title>
</svelte:head>

<div class="page">
	<EmptyState size="index" {title} description={gone?.description} icon={gone ? mark : undefined}>
		{#snippet action()}
			<Button href={resolve('/')}>{s.home}</Button>
		{/snippet}
	</EmptyState>
</div>

{#snippet mark()}
	<span class="mark"><Icon name={gone!.icon} size={80} strokeWidth="1.5" /></span>
{/snippet}

<style>
	.page {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		min-block-size: 100%;
	}

	.mark {
		display: flex;
		color: light-dark(var(--hue-gray-300), var(--hue-gray-700));
	}
</style>
