<script lang="ts">
	import { resolve } from '$app/paths';
	import SignedOutPage from '#lib/components/shell/SignedOutPage.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { auth } from '#lib/strings/auth.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = auth.password;
</script>

<SignedOutPage title={s.title}>
	{#if form?.message}
		<p role="alert">{form.message}</p>
	{:else if data.resetDone}
		<p role="status">{auth.reset.done}</p>
	{/if}
	<form method="POST" class="l:waterfall">
		<label class="l:waterfall">
			<span>{s.email}</span>
			<input name="email" type="email" required autocomplete="email" value={form?.email ?? ''} />
		</label>
		<label class="l:waterfall">
			<span>{s.password}</span>
			<input name="password" type="password" required autocomplete="current-password" />
		</label>
		<div>
			<SuedeButton type="submit">{s.submit}</SuedeButton>
		</div>
	</form>
	<p><a href={resolve('/login/forgot')}>{s.forgot}</a></p>
	<p><a href={resolve('/login')}>{s.withLink}</a></p>
</SignedOutPage>
