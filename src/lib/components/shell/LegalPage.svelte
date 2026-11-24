<script lang="ts">
	import { resolve } from '$app/paths';
	import SignedOutPage from '#lib/components/shell/SignedOutPage.svelte';
	import { legal, type LegalDocument } from '#lib/strings/legal.js';

	// A policy page anyone can read, signed in or not.
	let { document }: { document: LegalDocument } = $props();
</script>

<SignedOutPage title={document.title}>
	<p>{document.updated}</p>
	{#each document.intro as paragraph (paragraph)}
		<p>{paragraph}</p>
	{/each}
	{#each document.sections as section (section.heading)}
		<section class="l:waterfall">
			<h2>{section.heading}</h2>
			{#each section.paragraphs as paragraph (paragraph)}
				<p>{paragraph}</p>
			{/each}
		</section>
	{/each}
	<p><a href={resolve('/login')}>{legal.backToSignIn}</a></p>
</SignedOutPage>
