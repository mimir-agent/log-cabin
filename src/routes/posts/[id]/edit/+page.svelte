<script lang="ts">
	import { resolve } from '$app/paths';
	import ComposerCard from '#lib/components/posts/ComposerCard.svelte';
	import ComposerStage from '#lib/components/posts/ComposerStage.svelte';
	import PollEditor from '#lib/components/posts/PollEditor.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();
	const s = posts.composer;
</script>

<svelte:head>
	<title>{posts.post.editTitle} · {core.appName}</title>
</svelte:head>

<PageHeader title={posts.post.editTitle} back={resolve('/posts/[id]', { id: data.post.id })} />

<!-- Campsite edits a post in the same composer it was written in, with Save in place of Post. -->
<ComposerStage>
	<form method="POST">
		<ComposerCard
			projectName={data.post.projectName}
			title={form?.title ?? data.post.title}
			body={data.post.body}
			members={data.people}
			uploadUrl={`/projects/${data.post.projectId}/attachments`}
			submitLabel={s.save}
			cancelHref={resolve('/posts/[id]', { id: data.post.id })}
			message={form?.message}
		>
			<PollEditor value={data.poll} />
		</ComposerCard>
	</form>
</ComposerStage>
