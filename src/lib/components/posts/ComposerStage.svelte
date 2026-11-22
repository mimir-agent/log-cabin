<!--
@component
The page a post composer sits on. Campsite's composer is a dialog a tenth of the way down over a
quiet page; Campfire's is a page styled as that dialog. On a phone the form and its card fill the
screen, as Campsite's does.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	const { children }: { children: Snippet } = $props();
</script>

<div class="stage">{@render children()}</div>

<style>
	.stage {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 10vh var(--gap-lg) var(--gap-3xl);
		background-color: light-dark(var(--hue-gray-50), var(--hue-gray-950));
	}

	@media (max-width: 39.99rem) {
		.stage {
			padding: 0;
			background-color: var(--hue-z2-bg);
		}

		.stage > :global(form),
		.stage > :global(form > .composer) {
			display: flex;
			flex: 1;
			flex-direction: column;
			inline-size: 100%;
		}

		.stage > :global(form .composer-card) {
			flex: 1;
			border-radius: 0;
			box-shadow: none;
		}
	}
</style>
