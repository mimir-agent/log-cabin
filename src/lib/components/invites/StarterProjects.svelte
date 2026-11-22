<script lang="ts">
	import Switch from '#lib/components/ui/Switch.svelte';
	import { invites } from '#lib/strings/invites.js';

	type Props = {
		/** The projects the inviter may add people to. */
		projects: { id: string; name: string }[];
	};

	let { projects }: Props = $props();
	const s = invites.starters;
	const hintId = $props.id();
</script>

<!-- Each project is a switch named "project" whose value is its id, so the form sends every one turned on. -->
<fieldset aria-describedby={hintId}>
	<legend>{s.label}</legend>
	{#if projects.length === 0}
		<p class="hint" id={hintId}>{s.none}</p>
	{:else}
		<p class="hint" id={hintId}>{s.hint}</p>
		<div class="projects">
			{#each projects as project (project.id)}
				<Switch name="project" value={project.id} label={project.name} />
			{/each}
		</div>
	{/if}
</fieldset>

<style>
	fieldset {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		min-inline-size: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		padding: 0;
		margin-block-end: 0.375rem;
		color: var(--hue-text-secondary);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
		line-height: 1rem;
	}

	.hint {
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: var(--leading-tight);
	}

	.projects {
		display: grid;
		gap: var(--gap-md);
		max-block-size: 14rem;
		overflow-y: auto;
		padding-block: var(--gap-xs);
	}
</style>
