<script lang="ts">
	import { enhance } from '$app/forms';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import type { CallSummary } from '#lib/server/recordings/transcripts.js';
	import { calls } from '#lib/strings/calls.js';

	type Props = {
		summary: CallSummary;
		onseek: (lineId: string) => void;
		/** Offered when lines were edited after the summary was written. */
		canRegenerate?: boolean;
	};
	const { summary, onseek, canRegenerate = false }: Props = $props();
	const s = calls.recording;
</script>

<!-- What the call was about, written from its transcript. Each point links to the line it came
     from, and following the link plays the recording from there. -->
<section class="summary">
	{#each summary.sections as section (section.kind)}
		{#if section.summary.bullets.length}
			<h2>{s.sections[section.kind]}</h2>
			<ul>
				{#each section.summary.bullets as bullet, i (i)}
					<li>
						{bullet.text}
						{#each section.summary.sources.filter( (src) => bullet.cites.includes(src.id) ) as source (source.id)}
							<a
								class="cite"
								href="#line-{source.lineId}"
								onclick={() => onseek(source.lineId)}
								aria-label={s.citation(s.at(source.startMs))}>{s.at(source.startMs)}</a
							>
						{/each}
					</li>
				{/each}
			</ul>
		{/if}
	{/each}
	<small>{s.disclaimer}</small>
	{#if canRegenerate}
		<form method="POST" action="?/regenerateSummary" use:enhance>
			<small>{s.editLine.regenerateHint}</small>
			<SuedeButton type="submit">{s.editLine.regenerate}</SuedeButton>
		</form>
	{/if}
</section>

<style>
	.summary {
		display: grid;
		gap: var(--gap-sm);
		font-size: var(--type-body);
	}

	h2 {
		margin: var(--gap-sm) 0 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
	}

	ul {
		display: grid;
		gap: var(--gap-xs);
		margin: 0;
		padding-inline-start: var(--gap-lg);
		font-size: var(--type-prose);
		line-height: var(--leading-loose);
	}

	/* A citation is the time it points at, set small and raised, in the link colour whether or
	   not it was followed. */
	.cite {
		margin-inline-start: var(--gap-xs);
		color: var(--hue-link);
		font-size: var(--type-caption);
		font-variant-numeric: tabular-nums;
		text-decoration-thickness: from-font;
		text-underline-offset: 0.15em;
		vertical-align: super;
		line-height: 0;
	}

	.cite:hover {
		color: var(--hue-link-active);
	}

	small {
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}
</style>
