<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Thread/Bubble/DeleteAttachmentsDialog.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
"Delete attachments…" on a message, after Campsite's (CC BY-NC 4.0): choose which of its files
to delete; the text and the other files stay.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import { chat } from '#lib/strings/chat.js';

	type Props = {
		open: boolean;
		messageId: string;
		files: { id: string; name: string }[];
	};

	let { open = $bindable(), messageId, files }: Props = $props();
	const s = chat.deleteAttachments;
	const formId = $props.id();
</script>

<Dialog bind:open title={s.title} description={s.description} size="sm">
	<form
		id={formId}
		method="POST"
		action="?/deleteAttachments"
		use:enhance={() =>
			async ({ result, update }) => {
				await update();
				if (result.type === 'success') open = false;
			}}
	>
		<input type="hidden" name="messageId" value={messageId} />
		<fieldset>
			<legend class="u:visually-hidden">{s.title}</legend>
			{#each files as file (file.id)}
				<label>
					<input type="checkbox" name="attachments" value={file.id} />
					<span>{file.name}</span>
				</label>
			{/each}
		</fieldset>
	</form>
	{#snippet actions()}
		<Button onclick={() => (open = false)}>{chat.thread.cancel}</Button>
		<Button type="submit" form={formId} variant="danger">{s.confirm}</Button>
	{/snippet}
</Dialog>

<style>
	fieldset {
		display: grid;
		gap: var(--gap-sm);
		margin: 0;
		padding: 0;
		border: 0;
	}

	label {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-inline-size: 0;
		accent-color: var(--hue-accent);
	}

	span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
