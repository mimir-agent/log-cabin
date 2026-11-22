<script lang="ts">
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { core } from '#lib/strings/core.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = core.devLogin;
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="l:grid">
	<div class="dev-login l:waterfall" data-grid-columns="half">
		<h1>{s.title}</h1>
		<p>{s.intro}</p>
		<form method="POST" class="l:waterfall">
			{#if form?.message}
				<p role="alert">{form.message}</p>
			{/if}
			<label class="l:waterfall">
				<span>{s.email}</span>
				<input name="email" type="email" required value={form?.email ?? ''} />
			</label>
			<label class="l:waterfall">
				<span>{s.name}</span>
				<input name="name" required value={form?.name ?? ''} />
			</label>
			<label class="l:waterfall">
				<span>{s.role}</span>
				<select name="role">
					{#each data.roles as role (role)}
						<option value={role}>{core.roles[role]}</option>
					{/each}
				</select>
			</label>
			<div>
				<SuedeButton type="submit">{s.submit}</SuedeButton>
			</div>
		</form>
	</div>
</div>

<style>
	.dev-login {
		--waterfall-gap: var(--gap-lg);
		padding-block: var(--gap-2xl);
	}

	@media (max-width: 48rem) {
		.dev-login {
			grid-column: span 12;
		}
	}

	label {
		--waterfall-gap: var(--gap-xs);
		display: block;
	}
</style>
