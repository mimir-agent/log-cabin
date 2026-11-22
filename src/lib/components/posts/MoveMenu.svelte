<script lang="ts">
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import { posts } from '#lib/strings/posts.js';
	import MoveItems from './MoveItems.svelte';

	type Props = { targets: { id: string; name: string }[] };

	const { targets }: Props = $props();
</script>

<Menu align="end">
	{#snippet trigger({ props })}
		<IconButton {...props} icon="arrow-right" label={posts.move.menuLabel} />
	{/snippet}
	<MoveItems {targets} />
</Menu>
