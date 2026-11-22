<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Toolbar } from 'bits-ui';

	type Props = {
		/** Names the toolbar for screen readers, e.g. "Formatting". */
		label: string;
		/** ToolbarButtons, and ToolbarSeparators between groups. */
		children: Snippet;
	};

	let { label, children }: Props = $props();
</script>

<!-- Arrow keys move between buttons; Tab leaves the toolbar. -->
<Toolbar.Root aria-label={label} loop>
	{#snippet child({ props })}
		<div {...props} class="toolbar">
			{@render children()}
		</div>
	{/snippet}
</Toolbar.Root>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		align-items: center;
	}
</style>
