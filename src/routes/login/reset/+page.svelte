<script lang="ts">
	import SignedOutPage from '#lib/components/shell/SignedOutPage.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { auth } from '#lib/strings/auth.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = auth.reset;
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<SignedOutPage title={s.title}>
	<p>{s.intro}</p>
	{#if form?.message}
		<p role="alert">{form.message}</p>
	{/if}
	<form method="POST" class="l:waterfall">
		<input type="hidden" name="token" value={data.token} />
		<label class="l:waterfall">
			<span>{s.password}</span>
			<input
				name="password"
				type="password"
				required
				minlength={data.minLength}
				autocomplete="new-password"
			/>
			<small>{auth.security.passwordHint(data.minLength)}</small>
		</label>
		<div>
			<SuedeButton type="submit">{s.save}</SuedeButton>
		</div>
	</form>
</SignedOutPage>
