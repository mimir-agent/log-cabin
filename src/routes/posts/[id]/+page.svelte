<script lang="ts">
	import PostView from './PostView.svelte';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();
</script>

<PostView {data} {form} />
