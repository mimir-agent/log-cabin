<!--
@component
A labelled field in a settings section, after Campsite's TextField (packages/ui/src/TextField;
CC BY-NC 4.0): the label at 12px medium in the second grey, 6px above the control, and a hint
in the third grey 8px under it. An error (`FieldError`) takes the hint's place.

Put the control in `children` and give it `id={id}`, or `aria-describedby={hintId}`; both come
back from the snippet so the label and the hint point at it.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import FieldError from './FieldError.svelte';

	type Props = {
		label: string;
		hint?: string;
		error?: string;
		children: Snippet<[{ id: string; hintId: string | undefined }]>;
	};

	let { label, hint, error, children }: Props = $props();
	const id = $props.id();
	const hintId = $derived(error || hint ? `${id}-hint` : undefined);
</script>

<div class="field">
	<label class="label" for={id}>{label}</label>
	{@render children({ id, hintId })}
	{#if error}
		<FieldError id="{id}-hint" message={error} />
	{:else if hint}
		<p class="hint" id={hintId}>{hint}</p>
	{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		min-inline-size: 0;
	}

	.label {
		margin-block-end: 0.375rem;
		color: var(--hue-text-secondary);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
		line-height: 1rem;
	}

	.hint {
		margin: var(--gap-sm) 0 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: var(--leading-tight);
		text-wrap: pretty;
	}
</style>
