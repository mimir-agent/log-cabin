<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { resolve } from '$app/paths';
	import ComposerStage from '#lib/components/posts/ComposerStage.svelte';
	import PostComposer from '#lib/components/posts/PostComposer.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = posts.drafts;

	const confirmDelete: SubmitFunction = ({ cancel }) => {
		if (!confirm(s.confirmDelete)) cancel();
	};
</script>

<svelte:head>
	<title>{s.editTitle} · {data.project.name} · {core.appName}</title>
</svelte:head>

<PageHeader title={s.editTitle} back={resolve('/drafts')}>
	{#snippet description()}{data.project.name}{/snippet}
	{#snippet actions()}
		<form method="POST" action="?/delete" use:enhance={confirmDelete}>
			<Button type="submit" variant="ghost">{s.delete}</Button>
		</form>
	{/snippet}
</PageHeader>
<ComposerStage>
	{#key data.draft.id}
		<PostComposer
			projectId={data.project.id}
			projectName={data.project.name}
			members={data.members}
			draft={data.draft}
			message={form?.message}
		/>
	{/key}
</ComposerStage>
