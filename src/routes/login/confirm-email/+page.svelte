<script lang="ts">
	import SignedOutPage from '#lib/components/shell/SignedOutPage.svelte';
	import { resolve } from '$app/paths';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { auth } from '#lib/strings/auth.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = auth.emailChange;
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<SignedOutPage title={form?.done ? s.doneTitle : s.confirmTitle}>
	{#if form?.done}
		<p role="status">{form.done}</p>
		<p><a href={resolve('/')}>{s.continue}</a></p>
	{:else if !data.newEmail}
		<p role="alert">{s.errors.linkInvalid}</p>
	{:else}
		{#if form?.message}
			<p role="alert">{form.message}</p>
		{/if}
		<p>{s.confirmIntro(data.newEmail)}</p>
		<form method="POST">
			<input type="hidden" name="token" value={data.token} />
			<SuedeButton type="submit">{s.confirm}</SuedeButton>
		</form>
	{/if}
</SignedOutPage>
