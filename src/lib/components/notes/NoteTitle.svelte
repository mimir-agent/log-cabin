<!--
@component
A note's title as the field itself: a borderless textarea set like the heading it is, after
Campsite's `NoteTitle` (CC BY-NC 4.0). It grows with its text so a long title wraps instead of
scrolling, and Enter leaves it. Read-only readers get the same type as a heading.
-->
<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	type Props = Omit<HTMLTextareaAttributes, 'value' | 'class'> & {
		value: string;
		label: string;
		placeholder: string;
		/** Without it the title is a heading, not a field. */
		editable?: boolean;
		/** Enter in the field: blur by default; the new-note page moves into the body. */
		onenter?: (field: HTMLTextAreaElement) => void;
	};

	const {
		value,
		label,
		placeholder,
		editable = true,
		onenter = (field) => field.blur(),
		...rest
	}: Props = $props();

	/** Fits the field to its text. */
	function grow(field: HTMLTextAreaElement) {
		field.style.blockSize = 'auto';
		field.style.blockSize = `${field.scrollHeight}px`;
	}
</script>

{#if editable}
	<textarea
		{...rest}
		class="note-title"
		rows="1"
		maxlength="200"
		aria-label={label}
		{placeholder}
		{value}
		{@attach grow}
		oninput={(event) => grow(event.currentTarget)}
		onkeydown={(event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				onenter(event.currentTarget);
			}
		}}
	></textarea>
{:else}
	<h2 class="note-title">{value || placeholder}</h2>
{/if}

<style>
	/* Campsite's note title: 32–40px bold on a 1.2 line, the size following the viewport. */
	.note-title {
		display: block;
		inline-size: 100%;
		margin: 0;
		padding: 0;
		overflow: hidden;
		border: 0;
		background: none;
		color: var(--hue-z0-fg);
		font-family: inherit;
		font-size: clamp(2rem, 4vw, 2.5rem);
		font-weight: var(--fw-bold);
		letter-spacing: -0.02em;
		line-height: 1.2;
		text-wrap: balance;
		resize: none;
	}

	.note-title::placeholder {
		color: var(--hue-text-quaternary);
		opacity: 1;
	}
</style>
