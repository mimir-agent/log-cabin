<script lang="ts">
	import { enhance } from '$app/forms';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import type { RecordingsView } from '#lib/server/recordings/view.js';
	import { calls } from '#lib/strings/calls.js';

	type Line = RecordingsView['recordings'][number]['lines'][number];
	type Props = {
		line: Line;
		/** The line being spoken. */
		current: boolean;
		canEdit: boolean;
		onseek: () => void;
	};
	const { line, current, canEdit, onseek }: Props = $props();
	const s = calls.recording;
	const e = s.editLine;
	let editing = $state(false);
	let showingOriginal = $state(false);
</script>

<li id="line-{line.id}" aria-current={current ? 'true' : undefined}>
	{#if editing}
		<form
			class="editor"
			method="POST"
			action="?/editLine"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					editing = false;
				}}
		>
			<input type="hidden" name="lineId" value={line.id} />
			<label>
				<span class="muted">{e.label(line.speaker)}</span>
				<textarea name="text" rows="3" required>{line.text}</textarea>
			</label>
			<div class="tools">
				<SuedeButton type="submit">{e.save}</SuedeButton>
				<SuedeButton onclick={() => (editing = false)}>{e.cancel}</SuedeButton>
			</div>
		</form>
	{:else}
		<button type="button" class="seek" onclick={onseek}>
			<time class="muted">{s.at(line.startMs)}</time>
			<span class="turn">
				<strong>{line.speaker}</strong>
				{line.text}
				{#if line.original !== null}<small class="muted">{e.edited}</small>{/if}
			</span>
		</button>
		{#if canEdit || line.original !== null}
			<div class="tools">
				{#if canEdit}
					<SuedeButton onclick={() => (editing = true)}>{e.edit}</SuedeButton>
				{/if}
				{#if line.original !== null}
					<SuedeButton onclick={() => (showingOriginal = !showingOriginal)}>
						{showingOriginal ? e.hideOriginal : e.showOriginal}
					</SuedeButton>
					{#if canEdit}
						<form method="POST" action="?/revertLine" use:enhance>
							<input type="hidden" name="lineId" value={line.id} />
							<SuedeButton type="submit">{e.revert}</SuedeButton>
						</form>
					{/if}
				{/if}
			</div>
			{#if showingOriginal && line.original !== null}
				<p class="original muted">{e.original(line.original)}</p>
			{/if}
		{/if}
	{/if}
</li>

<style>
	li {
		margin-inline: calc(var(--gap-sm) * -1);
		border-radius: var(--radius-control);
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	/* A line is a button that looks like text: the time sits in its own column so the words
	   line up, and the words stay selectable. */
	.seek {
		display: grid;
		grid-template-columns: 3.5rem minmax(0, 1fr);
		column-gap: var(--gap-sm);
		align-items: baseline;
		inline-size: 100%;
		padding: var(--gap-xs) var(--gap-sm);
		border: 0;
		border-radius: inherit;
		background: none;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;
		user-select: text;
	}

	/* The line being spoken: a pale fill, quieter than the one a citation lands on. */
	li[aria-current] {
		background: color-mix(in srgb, var(--hue-z0-border) 50%, transparent);
	}

	/* A citation lands here: the line it points at lights up in the accent's pale fill. */
	li:target {
		background: var(--hue-accent-subtle);
	}

	time {
		font-size: var(--type-caption);
		font-variant-numeric: tabular-nums;
	}

	.turn {
		font-size: var(--type-prose);
		line-height: var(--leading-loose);
		overflow-wrap: anywhere;
	}

	.turn strong {
		font-weight: var(--fw-medium);
	}

	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
		align-items: center;
		padding: 0 var(--gap-sm) var(--gap-xs) calc(3.5rem + var(--gap-sm) * 2);
	}

	.editor {
		display: grid;
		gap: var(--gap-xs);
		padding: var(--gap-xs) var(--gap-sm);
	}

	.editor .tools {
		padding: 0;
	}

	textarea {
		inline-size: 100%;
		font: inherit;
	}

	.original {
		margin: 0;
		padding: 0 var(--gap-sm) var(--gap-xs) calc(3.5rem + var(--gap-sm) * 2);
		overflow-wrap: anywhere;
	}

	.muted {
		color: var(--hue-z0-muted);
	}
</style>
