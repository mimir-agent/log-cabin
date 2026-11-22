<!--
@component
The rows of a move menu: a heading and each channel the post can go to. Each row is its own form,
so choosing one sends it whether the rows are in a Menu of their own or in a longer one.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { DropdownMenu } from 'bits-ui';
	import { posts } from '#lib/strings/posts.js';

	type Props = { targets: { id: string; name: string }[] };

	const { targets }: Props = $props();
	const s = posts.move;
</script>

<DropdownMenu.Group>
	<DropdownMenu.GroupHeading>{s.menuLabel}</DropdownMenu.GroupHeading>
	{#each targets as target (target.id)}
		<form method="POST" action="?/move" use:enhance>
			<input type="hidden" name="projectId" value={target.id} />
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<button {...props} type="submit">{target.name}</button>
				{/snippet}
			</DropdownMenu.Item>
		</form>
	{:else}
		<DropdownMenu.Item disabled>{s.noTargets}</DropdownMenu.Item>
	{/each}
</DropdownMenu.Group>
