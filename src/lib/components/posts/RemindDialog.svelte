<!--
@component
The dialog for a reminder at a time of your own, after Campsite's follow-up menu's "Custom…".
-->
<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { posts } from '#lib/strings/posts.js';

	type Props = {
		open: boolean;
		/** The form action that takes showAt (epoch ms) with the fields below. */
		action: string;
		fields: Record<string, string>;
	};

	let { open = $bindable(), action, fields }: Props = $props();
	const s = posts.followUps;
	const formId = $props.id();

	// The time is worked out here, in the browser's own time zone, as the form is sent.
	const withPickedTime: SubmitFunction = (input) => {
		const showAt = new Date(String(input.formData.get('at'))).getTime();
		input.formData.set('showAt', String(showAt));
		return async ({ update }) => {
			await update({ navigate: false });
			open = false;
		};
	};
</script>

<Dialog bind:open title={s.pickTitle} size="sm">
	<form id={formId} method="POST" {action} use:enhance={withPickedTime}>
		{#each Object.entries(fields) as [name, value] (name)}
			<input type="hidden" {name} {value} />
		{/each}
		<label class="field">
			{s.pickLabel}
			<input type="datetime-local" name="at" required />
		</label>
		<label class="check">
			<input type="checkbox" name="notifyAnyway" checked />
			{s.notifyAnyway}
		</label>
	</form>
	{#snippet actions()}
		<Button onclick={() => (open = false)}>{s.cancel}</Button>
		<SuedeButton type="submit" form={formId}>{s.save}</SuedeButton>
	{/snippet}
</Dialog>

<style>
	.field {
		display: grid;
		gap: var(--gap-xs);
	}

	.check {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		margin-block-start: var(--gap-md);
	}
</style>
