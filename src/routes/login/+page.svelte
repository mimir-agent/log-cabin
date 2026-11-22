<script lang="ts">
	import { resolve } from '$app/paths';
	import SignedOutPage from '#lib/components/shell/SignedOutPage.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { auth } from '#lib/strings/auth.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = auth.login;
</script>

<SignedOutPage title={s.title}>
	{#if form?.sent}
		<p role="status">{s.sent(form.email)}</p>
	{:else if data.setupDone}
		<p role="status">{auth.setupDone}</p>
	{:else if data.asked}
		<p role="status">{data.asked}</p>
	{:else}
		<p>{s.intro}</p>
		{#if form?.message ?? data.error}
			<p role="alert">{form?.message ?? data.error}</p>
		{/if}
		<form method="POST" class="l:waterfall">
			<label class="l:waterfall">
				<span>{s.email}</span>
				<input name="email" type="email" required autocomplete="email" value={form?.email ?? ''} />
			</label>
			<div>
				<SuedeButton type="submit">{s.submit}</SuedeButton>
			</div>
		</form>
		<p><a href={resolve('/login/password')}>{s.withPassword}</a></p>
		{#if data.google}
			<p>{s.or}</p>
			<!-- A full page load: the server answers with a redirect to Google. -->
			<div>
				<SuedeButton href={resolve('/auth/google')} data-sveltekit-reload>{s.google}</SuedeButton>
			</div>
		{/if}
	{/if}
</SignedOutPage>
