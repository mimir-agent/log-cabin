<script lang="ts">
	import SignedOutPage from '#lib/components/shell/SignedOutPage.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { auth } from '#lib/strings/auth.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = auth.verify;
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<SignedOutPage title={s.title}>
	{#if form?.message}
		<p role="alert">{form.message}</p>
	{:else if form?.asked}
		<p role="status">{form.asked}</p>
	{:else}
		<p>{s.intro}</p>
		<form method="POST">
			<input type="hidden" name="token" value={data.token} />
			<SuedeButton type="submit">{s.submit}</SuedeButton>
		</form>
	{/if}
</SignedOutPage>
