<!-- A project's name, description, emoji and privacy, from its "…" menu. A refused change keeps the dialog open with the reason. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import { core } from '#lib/strings/core.js';
	import { people } from '#lib/strings/people.js';
	import { posts } from '#lib/strings/posts.js';

	type Props = {
		project: {
			name: string;
			description: string;
			accessory: string | null;
			private: boolean;
			isMember: boolean;
		};
		error?: string;
		open: boolean;
	};

	let { project, error, open = $bindable() }: Props = $props();
	const s = posts.channelSettings;

	// Each time the dialog opens it starts from what is saved.
	let accessory = $state('');
	let makePrivate = $state(false);
	$effect(() => {
		if (open) {
			accessory = project.accessory ?? '';
			makePrivate = project.private;
		}
	});
</script>

<Dialog bind:open title={s.title}>
	<form
		id="edit-project"
		method="POST"
		action="?/update"
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') open = false;
			}}
	>
		<SettingsField label={s.nameLabel} {error}>
			{#snippet children({ id, hintId })}
				<input
					{id}
					name="name"
					value={project.name}
					maxlength="80"
					required
					aria-describedby={hintId}
				/>
			{/snippet}
		</SettingsField>
		<SettingsField label={s.descriptionLabel}>
			{#snippet children({ id })}
				<textarea
					{id}
					name="description"
					rows="3"
					placeholder={s.descriptionPlaceholder}
					value={project.description}
				></textarea>
			{/snippet}
		</SettingsField>
		<fieldset class="group">
			<legend>{s.emojiLabel}</legend>
			<input type="hidden" name="accessory" value={accessory} />
			<div class="choices">
				{#each people.status.emojiChoices as choice (choice)}
					<button
						type="button"
						class="choice"
						aria-pressed={accessory === choice}
						onclick={() => (accessory = choice)}>{choice}</button
					>
				{/each}
			</div>
			{#if accessory}
				<Button type="button" variant="ghost" onclick={() => (accessory = '')}
					>{s.emojiRemove}</Button
				>
			{/if}
		</fieldset>
		<fieldset class="group">
			<legend>{s.visibilityLabel}</legend>
			<label class="check">
				<input
					type="radio"
					name="private"
					value="false"
					checked={!makePrivate}
					onchange={() => (makePrivate = false)}
				/>
				<span>{s.public}</span>
			</label>
			<label class="check">
				<input
					type="radio"
					name="private"
					value="true"
					checked={makePrivate}
					onchange={() => (makePrivate = true)}
				/>
				<span>{s.private}</span>
			</label>
			{#if makePrivate && !project.private}
				<p class="warning">{s.makePrivateWarning}</p>
				{#if !project.isMember}
					<p class="warning">{s.makePrivateLosesYourAccess}</p>
				{/if}
			{:else if !makePrivate && project.private}
				<p class="warning">{s.makePublicWarning}</p>
			{/if}
		</fieldset>
	</form>
	{#snippet actions()}
		<Button onclick={() => (open = false)}>{core.actions.close}</Button>
		<Button type="submit" form="edit-project" variant="primary">{s.save}</Button>
	{/snippet}
</Dialog>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: var(--gap-md);
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

	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
	}

	.choice {
		min-inline-size: var(--control-h-lg);
		min-block-size: var(--control-h-lg);
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-control);
		background: none;
		font-size: 1.25rem;
	}

	.choice[aria-pressed='true'] {
		background-color: var(--hue-z1-bg);
	}

	.warning {
		margin: var(--gap-xs) 0 0;
		color: var(--hue-z0-muted);
	}

	.check {
		display: flex;
		gap: var(--gap-xs);
		align-items: center;
	}
</style>
