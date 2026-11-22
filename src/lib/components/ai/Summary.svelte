<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import type { GroundedSummary } from '#lib/server/ai/grounded.js';
	import { ai } from '#lib/strings/ai.js';

	type Props = {
		summary?: GroundedSummary;
		error?: string;
		disclaimer?: string;
		/** The discussion is too short to summarize: say so in place of the button. */
		tooShort?: boolean;
	};
	const s = ai.summary;
	const { summary, error, disclaimer = s.disclaimer, tooShort = false }: Props = $props();
	let pending = $state(false);
	let shownSource = $state<number>();

	const submit: SubmitFunction = () => {
		pending = true;
		return async ({ update }) => {
			await update({ reset: false });
			pending = false;
		};
	};
</script>

<section class="summary l:waterfall" aria-label={s.title}>
	{#if tooShort}
		<small>{s.tooShort}</small>
	{:else}
		<form method="POST" action="?/summarize" use:enhance={submit}>
			<SuedeButton type="submit" disabled={pending}>{pending ? s.pending : s.button}</SuedeButton>
		</form>
	{/if}
	{#if error}
		<p class="error" role="alert">{error}</p>
	{:else if summary}
		{#if summary.bullets.length}
			<ul>
				{#each summary.bullets as bullet, i (i)}
					<li>
						{bullet.text}
						{#each bullet.cites as id (id)}
							{@const anchor = summary.sources.find((source) => source.id === id)?.anchor}
							<!-- A comment or message links to itself on the page; the title and body, to their quote below. -->
							<a
								class="cite"
								href="#{anchor ?? `summary-source-${id}`}"
								aria-label={s.citation(id)}
								onclick={() => (shownSource = id)}>{id}</a
							>
						{/each}
					</li>
				{/each}
			</ul>
			<h3>{s.sources}</h3>
			<ol class="sources">
				{#each summary.sources as source (source.id)}
					<li
						id="summary-source-{source.id}"
						value={source.id}
						class:shown={shownSource === source.id}
					>
						<q>{source.text}</q>
						<cite>{source.author}, {source.kind}</cite>
					</li>
				{/each}
			</ol>
		{:else}
			<p>{s.empty}</p>
		{/if}
		<small>{disclaimer}</small>
	{/if}
</section>

<style>
	.summary {
		--waterfall-gap: var(--gap-sm);
	}

	.cite {
		margin-inline-start: 0.25em;
		font-size: var(--type-caption);
		vertical-align: super;
	}

	h3 {
		font-size: var(--type-caption);
	}

	.shown {
		background: var(--hue-accent-subtle);
	}

	cite,
	small {
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}

	cite {
		display: block;
		font-style: normal;
	}
</style>
