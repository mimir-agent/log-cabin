<!--
@component
The rows of a reminder menu: the presets, a time of your own, and removing the reminder when one
is set. They go in a Menu; the time of your own opens a RemindDialog, which can't live in the menu
because the menu closes first.
-->
<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { DropdownMenu } from 'bits-ui';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { followUpPresets, presetTime, type FollowUpPreset } from '#lib/follow-ups.js';
	import { posts } from '#lib/strings/posts.js';

	type Props = {
		/** The form action that takes showAt (epoch ms) with the fields below. */
		action: string;
		fields: Record<string, string>;
		/** The viewer's reminder on this subject, if any, which can be removed from here. */
		reminder?: { id: string };
		oncustom: () => void;
	};

	const { action, fields, reminder, oncustom }: Props = $props();
	const s = posts.followUps;

	// The action may be another page's (/follow-ups): stay here and reload this page's data.
	const stay: SubmitFunction =
		() =>
		({ update }) =>
			update({ navigate: false });

	// The time is worked out here, in the browser's own time zone, as the choice is made.
	const withPresetTime: SubmitFunction = (input) => {
		const preset = (input.submitter as HTMLButtonElement).value as FollowUpPreset;
		input.formData.set('showAt', String(presetTime(preset, new Date())));
		return stay(input);
	};
</script>

<form method="POST" {action} use:enhance={withPresetTime}>
	{#each Object.entries({ ...fields, notifyAnyway: 'on' }) as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
	{#each followUpPresets as preset (preset)}
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<button {...props} type="submit" value={preset}>{s.presets[preset]}</button>
			{/snippet}
		</DropdownMenu.Item>
	{/each}
</form>
<DropdownMenu.Item onSelect={oncustom}>{s.custom}</DropdownMenu.Item>
{#if reminder}
	<DropdownMenu.Separator />
	<form method="POST" action="/follow-ups?/finish" use:enhance={stay}>
		<input type="hidden" name="id" value={reminder.id} />
		<DropdownMenu.Item data-tone="danger">
			{#snippet child({ props })}
				<button {...props} type="submit">
					<Icon name="trash" />
					{s.remove}
				</button>
			{/snippet}
		</DropdownMenu.Item>
	</form>
{/if}
