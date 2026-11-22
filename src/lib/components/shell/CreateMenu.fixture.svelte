<script lang="ts">
	import CreateMenu from './CreateMenu.svelte';
</script>

<CreateMenu newPostHref="/projects/p1/new">
	{#snippet button({ props })}
		<button {...props} type="button">New</button>
	{/snippet}
</CreateMenu>
