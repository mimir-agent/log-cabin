<script lang="ts">
	import SignedOutPage from '#lib/components/shell/SignedOutPage.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { auth } from '#lib/strings/auth.js';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	const s = auth.twoFactor;
</script>

<SignedOutPage title={s.title}>
	<p>{s.intro}</p>
	{#if form?.message}
		<p role="alert">{form.message}</p>
	{/if}
	<form method="POST" class="l:waterfall">
		<label class="l:waterfall">
			<span>{s.code}</span>
			<input name="code" required autocomplete="one-time-code" spellcheck="false" />
		</label>
		<div>
			<SuedeButton type="submit">{s.submit}</SuedeButton>
		</div>
	</form>
</SignedOutPage>
