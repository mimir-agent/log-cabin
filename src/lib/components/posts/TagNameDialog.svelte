<!-- Naming a tag, to create one or to rename one. A refused name keeps the dialog open with the reason. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import { posts } from '#lib/strings/posts.js';

	type Props = {
		open: boolean;
		title: string;
		submit: string;
		/** The form action: ?/create or ?/rename. */
		action: string;
		/** The tag being renamed, sent along; empty when creating. */
		from?: string;
		error?: string;
	};

	let { open = $bindable(), title, submit, action, from = '', error }: Props = $props();
	const s = posts.tags;
</script>

<Dialog bind:open {title}>
	<form
		id="tag-name"
		method="POST"
		{action}
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') open = false;
			}}
	>
		<input type="hidden" name="from" value={from} />
		<SettingsField label={s.nameLabel} {error}>
			{#snippet children({ id, hintId })}
				<input
					{id}
					name="name"
					value={from}
					maxlength="32"
					required
					autocomplete="off"
					aria-describedby={hintId}
				/>
			{/snippet}
		</SettingsField>
	</form>
	{#snippet actions()}
		<Button onclick={() => (open = false)}>{s.cancel}</Button>
		<Button type="submit" form="tag-name" variant="primary">{submit}</Button>
	{/snippet}
</Dialog>
