<script lang="ts">
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { core } from '#lib/strings/core.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = core.setup;
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<div class="l:grid">
	<div class="setup l:waterfall" data-grid-columns="half">
		<h1>{s.title}</h1>
		<p>{s.intro}</p>
		<form method="POST" class="l:waterfall">
			{#if form?.message}
				<p role="alert">{form.message}</p>
			{/if}
			<label class="l:waterfall">
				<span>{s.orgName}</span>
				<input name="orgName" required value={form?.orgName ?? ''} />
			</label>
			<label class="l:waterfall">
				<span>{s.adminName}</span>
				<input name="adminName" required autocomplete="name" value={form?.adminName ?? ''} />
			</label>
			<label class="l:waterfall">
				<span>{s.email}</span>
				<input name="email" type="email" required autocomplete="email" value={form?.email ?? ''} />
			</label>
			{#if data.tokenRequired}
				<label class="l:waterfall">
					<span>{s.token}</span>
					<input name="token" required autocomplete="off" value={data.token} />
				</label>
			{/if}
			<div>
				<SuedeButton type="submit">{s.submit}</SuedeButton>
			</div>
		</form>
	</div>
</div>

<style>
	.setup {
		--waterfall-gap: var(--gap-lg);
		padding-block: var(--gap-2xl);
	}

	@media (max-width: 48rem) {
		.setup {
			grid-column: span 12;
		}
	}

	label {
		--waterfall-gap: var(--gap-xs);
		display: block;
	}
</style>
