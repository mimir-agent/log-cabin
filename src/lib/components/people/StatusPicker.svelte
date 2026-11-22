<script lang="ts">
	// Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Home/UpdateStatusDialog.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/
	import { enhance, type SubmitFunction } from '$app/forms';
	import { DropdownMenu } from 'bits-ui';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import Popover from '#lib/components/ui/Popover.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import Banner from '#lib/components/ui/Banner.svelte';
	import {
		statusExpiries,
		statusPresets,
		statusTextMax,
		type Status,
		type StatusExpiry
	} from '#lib/people/status.js';
	import { people } from '#lib/strings/people.js';

	type Props = {
		/** Your own username: the picker saves through your profile page. */
		username: string;
		status: Status | null;
	};

	let { username, status }: Props = $props();
	const s = people.status;

	let open = $state(false);
	let message = $state('');
	let emoji = $state('');
	let text = $state('');
	let expiry = $state<StatusExpiry>('today');
	const left = $derived(statusTextMax - [...text].length);

	function reset(isOpen: boolean) {
		if (!isOpen) return;
		emoji = status?.emoji ?? s.emojiChoices[0];
		text = status?.text ?? '';
		expiry = status ? 'never' : 'today';
		message = '';
	}

	const action = (name: string) => `/people/${encodeURIComponent(username)}?/${name}`;

	const save: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				message = String(result.data?.message ?? '');
				return;
			}
			open = false;
			await update();
		};
	};
</script>

<Popover bind:open width="22rem" label={s.title} onOpenChange={reset}>
	{#snippet trigger({ props })}
		<Button {...props} variant="ghost" size="sm">{status ? s.edit : s.set}</Button>
	{/snippet}
	<form method="POST" action={action('status')} class="picker" use:enhance={save}>
		<div class="presets" role="group" aria-label={s.presetsLabel}>
			{#each statusPresets as preset (preset.text)}
				<Button
					variant="ghost"
					size="sm"
					onclick={() => {
						emoji = preset.emoji;
						text = preset.text;
						expiry = preset.expiry;
					}}
				>
					<span aria-hidden="true">{preset.emoji}</span>
					{preset.text} · {s.expiries[preset.expiry]}
				</Button>
			{/each}
		</div>
		<fieldset class="emoji">
			<legend>{s.emoji}</legend>
			{#each s.emojiChoices as choice (choice)}
				<label>
					<input
						class="u:visually-hidden"
						type="radio"
						name="emoji"
						value={choice}
						bind:group={emoji}
					/>
					{choice}
				</label>
			{/each}
		</fieldset>
		<SettingsField label={s.text} hint={left <= 20 ? s.count(left) : undefined}>
			{#snippet children({ id, hintId })}
				<input
					{id}
					name="text"
					bind:value={text}
					maxlength={statusTextMax}
					required
					aria-describedby={hintId}
				/>
			{/snippet}
		</SettingsField>
		<SettingsField label={s.clearAfter}>
			{#snippet children({ id })}
				<input type="hidden" name="expiry" value={expiry} />
				<div class="clear-after">
					<Menu>
						{#snippet trigger({ props })}
							<Button {...props} {id} aria-label={s.clearAfterChoice(s.expiries[expiry])}>
								{s.expiries[expiry]}
								<Icon name="chevron-down" />
							</Button>
						{/snippet}
						<DropdownMenu.RadioGroup value={expiry}>
							{#each statusExpiries as choice (choice)}
								<DropdownMenu.RadioItem value={choice} onSelect={() => (expiry = choice)}>
									{s.expiries[choice]}
								</DropdownMenu.RadioItem>
							{/each}
						</DropdownMenu.RadioGroup>
					</Menu>
				</div>
			{/snippet}
		</SettingsField>
		{#if expiry === 'custom'}
			<SettingsField label={s.customAt}>
				{#snippet children({ id })}
					<input {id} name="customAt" type="datetime-local" required />
				{/snippet}
			</SettingsField>
		{/if}
		{#if message}<Banner tone="danger">{message}</Banner>{/if}
		<div class="actions">
			{#if status}
				<Button type="submit" formaction={action('clearStatus')} formnovalidate>{s.clear}</Button>
			{/if}
			<SuedeButton type="submit">{s.save}</SuedeButton>
		</div>
	</form>
</Popover>

<style>
	.picker {
		display: grid;
		gap: var(--gap-md);
	}

	.presets {
		display: grid;
		justify-items: start;
	}

	.emoji {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
		margin: 0;
		padding: 0;
		border: none;
	}

	legend {
		margin-block-end: 0.375rem;
		padding: 0;
		color: var(--hue-text-secondary);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
	}

	.emoji label {
		display: grid;
		place-items: center;
		inline-size: var(--control-h-md);
		block-size: var(--control-h-md);
		border-radius: var(--radius-control);
		font-size: var(--text-lg);
		cursor: pointer;
	}

	.emoji label:hover {
		background-color: var(--hue-hover);
	}

	.emoji label:has(:checked) {
		background-color: var(--hue-selected);
	}

	.emoji label:has(:focus-visible) {
		outline: var(--focus-ring-width) solid var(--hue-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	.actions {
		display: flex;
		justify-content: end;
		gap: var(--gap-sm);
	}

	/* The button keeps the width of its choice; the field would stretch it. */
	.clear-after {
		display: flex;
	}
</style>
