<script lang="ts">
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { auth } from '#lib/strings/auth.js';
	import { core } from '#lib/strings/core.js';
	import { invites } from '#lib/strings/invites.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = auth.accept;
</script>

<svelte:head>
	<title>{s.title(data.orgName)} · {core.appName}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="l:grid">
	<div class="accept l:waterfall" data-grid-columns="half">
		<h1>{s.title(data.orgName)}</h1>
		{#if !data.invite}
			<p role="alert">{s.invalid}</p>
		{:else if form?.requestedFor}
			<p role="status">{s.requested(form.requestedFor)}</p>
		{:else}
			<p>{s.asRole(core.roles[data.invite.role])}</p>
			{#if data.invite.starters.length}
				<p>{invites.starters.onAccept(data.invite.starters)}</p>
			{/if}
			{#if form?.message}
				<p role="alert">{form.message}</p>
			{/if}
			{#if data.invite.email}
				<form method="POST" action="?/accept" class="l:waterfall">
					<p>{data.invite.email}</p>
					<label class="l:waterfall">
						<span>{s.name}</span>
						<input name="name" required autocomplete="name" />
					</label>
					<div>
						<SuedeButton type="submit">{s.accept}</SuedeButton>
					</div>
				</form>
			{:else}
				<form method="POST" action="?/request" class="l:waterfall">
					<label class="l:waterfall">
						<span>{s.email}</span>
						<input name="email" type="email" required autocomplete="email" />
					</label>
					<div>
						<SuedeButton type="submit">{s.request}</SuedeButton>
					</div>
				</form>
			{/if}
		{/if}
	</div>
</div>

<style>
	.accept {
		--waterfall-gap: var(--gap-lg);
		padding-block: var(--gap-2xl);
	}

	@media (max-width: 48rem) {
		.accept {
			grid-column: span 12;
		}
	}

	label {
		--waterfall-gap: var(--gap-xs);
		display: block;
	}
</style>
