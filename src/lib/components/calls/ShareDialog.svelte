<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';
	import { calls } from '#lib/strings/calls.js';
	import { core } from '#lib/strings/core.js';

	type Props = {
		channels: { id: string; name: string }[];
		share: { projectId: string; permission: 'view' | 'edit' } | null;
	};
	let { channels, share }: Props = $props();
	const s = calls.share;
	let open = $state(false);
	const channelOf = (id: string) => channels.find((c) => c.id === id)?.name ?? '';
</script>

<Dialog bind:open title={s.title} size="sm">
	{#snippet trigger({ props })}
		<Button {...props} variant="ghost" size="sm">
			<Icon name="link" size={16} />{s.title}
		</Button>
	{/snippet}
	<form
		id="share-call"
		method="POST"
		action="?/share"
		use:enhance={({ formData }) => {
			const name = channelOf(String(formData.get('channel')));
			return async ({ result, update }) => {
				await update();
				if (result.type === 'success') {
					open = false;
					toast(s.shared(name));
				}
			};
		}}
	>
		<label class="field">
			<span>{s.channel}</span>
			<select name="channel" required>
				{#each channels as channel (channel.id)}
					<option value={channel.id} selected={channel.id === share?.projectId}>
						{channel.name}
					</option>
				{/each}
			</select>
		</label>
		<fieldset class="group">
			<legend>{s.permission}</legend>
			{#each ['view', 'edit'] as const as permission (permission)}
				<div class="choice">
					<label class="check">
						<input
							type="radio"
							name="permission"
							value={permission}
							checked={permission === (share?.permission ?? 'view')}
							aria-describedby="share-{permission}-hint"
						/>
						<span>{s[permission]}</span>
					</label>
					<p id="share-{permission}-hint" class="hint">{s[`${permission}Hint`]}</p>
				</div>
			{/each}
		</fieldset>
	</form>
	{#snippet actions()}
		{#if share}
			<form
				method="POST"
				action="?/unshare"
				use:enhance={() =>
					async ({ result, update }) => {
						await update();
						if (result.type === 'success') {
							open = false;
							toast(s.removed);
						}
					}}
			>
				<Button type="submit" variant="danger">{s.remove}</Button>
			</form>
		{/if}
		<Button onclick={() => (open = false)}>{core.actions.close}</Button>
		<Button type="submit" form="share-call" variant="primary">{s.submit}</Button>
	{/snippet}
</Dialog>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: var(--gap-md);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
	}

	.group {
		margin: 0;
		padding: 0;
		border: 0;
		font-size: var(--type-body);
	}

	legend {
		margin-block-end: var(--gap-xs);
		color: var(--hue-z0-muted);
		font-weight: var(--fw-medium);
	}

	.choice + .choice {
		margin-block-start: var(--gap-xs);
	}

	.check {
		display: flex;
		gap: var(--gap-xs);
		align-items: center;
	}

	.hint {
		margin: 0;
		padding-inline-start: 1.5rem;
		color: var(--hue-z0-muted);
	}
</style>
