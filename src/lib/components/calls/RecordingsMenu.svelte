<script lang="ts">
	import { enhance } from '$app/forms';
	import { DropdownMenu } from 'bits-ui';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';
	import { calls } from '#lib/strings/calls.js';
	import { core } from '#lib/strings/core.js';

	const s = calls.recording;
	let confirming = $state(false);
</script>

<Menu align="end">
	{#snippet trigger({ props })}
		<IconButton {...props} icon="dots-horizontal" label={core.actions.more} />
	{/snippet}
	<DropdownMenu.Item data-tone="danger" onSelect={() => (confirming = true)}>
		<Icon name="trash" />
		{s.deleteAll}
	</DropdownMenu.Item>
</Menu>

<Dialog bind:open={confirming} title={s.deleteAllTitle} description={s.deleteAllBody} size="sm">
	{#snippet actions()}
		<Button onclick={() => (confirming = false)}>{s.deleteAllCancel}</Button>
		<form
			method="POST"
			action="?/deleteRecordings"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') toast(s.deleteAllDone);
				}}
		>
			<Button type="submit" variant="danger">{s.deleteAllConfirm}</Button>
		</form>
	{/snippet}
</Dialog>
