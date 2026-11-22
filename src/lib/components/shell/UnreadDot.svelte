<script lang="ts">
	import { shell } from '#lib/strings/shell.js';

	/** label: what a screen reader hears. Pass "" when the row already says it's unread. */
	let { label = shell.unreadDot }: { label?: string } = $props();
</script>

{#if label}
	<span class="dot" role="img" aria-label={label}></span>
{:else}
	<span class="dot" aria-hidden="true"></span>
{/if}

<style>
	.dot {
		display: inline-block;
		flex: none;
		inline-size: var(--gap-sm);
		block-size: var(--gap-sm);
		border-radius: var(--radius-full);
		background-color: var(--hue-unread);
	}
</style>
