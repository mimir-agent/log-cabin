<!--
@component
What happened to a settings form, said quietly at the start of its footer, before Save:
"Saved." in the third grey, or what went wrong in red. Campsite says this in a toast; a line
beside the button that was pressed is easier to find and stays until the next save.
-->
<script lang="ts">
	type Props = { message?: string; saved?: string };

	let { message, saved }: Props = $props();
</script>

{#if message}
	<p class="status" data-tone="danger" role="alert">{message}</p>
{:else if saved}
	<p class="status" role="status">{saved}</p>
{/if}

<style>
	.status {
		flex: 1;
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: var(--leading-tight);
		text-wrap: pretty;
	}

	.status[data-tone='danger'] {
		color: var(--hue-danger);
	}
</style>
