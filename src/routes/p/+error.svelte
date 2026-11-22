<script lang="ts">
	import { page } from '$app/state';
	import { posts } from '#lib/strings/posts.js';
	import PublicFrame from '#lib/components/shell/PublicFrame.svelte';

	const s = posts.publicLink;
</script>

<svelte:head>
	<title>{s.deadTitle}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<!-- Revoked, turned off or never existed all look the same, so the page never says which. -->
<PublicFrame orgName={null} logoUrl={null}>
	<h1 class="u:type-title">{s.deadTitle}</h1>
	<p>{page.error?.message}</p>
</PublicFrame>
