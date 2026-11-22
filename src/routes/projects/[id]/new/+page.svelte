<script lang="ts">
	import ProjectPage from '../+page.svelte';
	import type { PageData } from '../$types';

	// The project's page, from its own load (see +page.server.ts); the root layout opens the
	// new-post dialog over it at this address.
	let { data, params }: { data: PageData; params: { id: string } } = $props();
</script>

<ProjectPage {data} {params} form={null} />
