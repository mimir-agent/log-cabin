<!--
@component
A new note as the document it will become: the title as a borderless heading, then the body as
note prose with the formatting tools in a quiet sticky row, as on a saved note. The page puts
its submit and cancel buttons in the titlebar, tied to this form by `id`.
-->
<script lang="ts">
	import Editor from '#lib/components/editor/Editor.svelte';
	import NoteTitle from '#lib/components/notes/NoteTitle.svelte';
	import type { DocNode } from '#lib/editor/doc.js';
	import { notes } from '#lib/strings/notes.js';

	type Props = {
		id: string;
		title: string;
		body: DocNode | null;
		people: { id: string; name: string }[];
		message?: string;
		/** The project the new note is shared with, at view. */
		projectId?: string;
	};

	const { id, title, body, people, message, projectId }: Props = $props();
	const s = notes.editor;

	/** Enter in the title carries on into the body, as it does in Campsite. */
	function intoBody(field: HTMLTextAreaElement) {
		field.form?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
	}
</script>

<form method="POST" {id} class="note-form">
	{#if message}<p class="error" role="alert">{message}</p>{/if}
	{#if projectId}<input type="hidden" name="projectId" value={projectId} />{/if}
	<NoteTitle
		autofocus
		name="title"
		value={title}
		label={s.title}
		placeholder={s.titlePlaceholder}
		onenter={intoBody}
	/>
	<div class="body">
		<Editor
			name="body"
			checklists
			slash
			value={body}
			note
			placeholder={s.bodyPlaceholder}
			members={people}
		/>
	</div>
</form>

<style>
	.note-form {
		display: flex;
		flex-direction: column;
		gap: var(--gap-lg);
	}

	.error {
		margin: 0;
		color: var(--hue-danger);
	}

	/* The same bare editor as a saved note: no box, no inset, the tools sticky above the text. */
	.body :global(.editor) {
		border: 0;
		background: none;
	}

	.body :global(.editor .toolbar:not(.bubble)) {
		position: sticky;
		inset-block-start: var(--header-h);
		z-index: 1;
		margin-inline: -0.375rem;
		padding: var(--gap-xs) 0;
		border-block-end: 0;
		background-color: var(--hue-z0-bg);
	}

	.body :global(.editor .content) {
		min-block-size: 12rem;
		padding: 0;
	}
</style>
