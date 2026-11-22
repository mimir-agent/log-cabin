<script lang="ts">
	import SignedOutPage from '#lib/components/shell/SignedOutPage.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { auth } from '#lib/strings/auth.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = auth.reset;
</script>

<SignedOutPage title={s.requestTitle}>
	{#if form?.sent}
		<p role="status">{s.sent(form.email)}</p>
	{:else}
		<p>{s.requestIntro}</p>
		{#if form?.message}
			<p role="alert">{form.message}</p>
		{:else if data.linkInvalid}
			<p role="alert">{s.errors.linkInvalid}</p>
		{/if}
		<form method="POST" class="l:waterfall">
			<label class="l:waterfall">
				<span>{s.email}</span>
				<input name="email" type="email" required autocomplete="email" value={form?.email ?? ''} />
			</label>
			<div>
				<SuedeButton type="submit">{s.send}</SuedeButton>
			</div>
		</form>
	{/if}
</SignedOutPage>
