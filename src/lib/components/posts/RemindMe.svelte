<!--
@component
A reminder menu, after Campsite's follow-up menu: the presets, then a dialog for a time of your
own, then removing the reminder when one is set.
-->
<script lang="ts">
	import { page } from '$app/state';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import { posts } from '#lib/strings/posts.js';
	import RemindDialog from './RemindDialog.svelte';
	import RemindItems from './RemindItems.svelte';

	type Props = {
		/** The form action that takes showAt (epoch ms) with the fields below. */
		action: string;
		fields: Record<string, string>;
		/** The viewer's reminder on this subject, if any, which can be removed from here. */
		reminder?: { id: string; showAt: number };
		label?: string;
		/**
		 * ghost in titlebars, where it shows only its icon below 1024px as the titlebar's other
		 * actions do; secondary among a list row's buttons; icon among a row's hover actions,
		 * where the label is the tooltip.
		 */
		variant?: 'ghost' | 'secondary' | 'icon';
		/** sm in a touch row's context line and beside other sm buttons; md by default. */
		size?: 'sm' | 'md';
	};

	const {
		action,
		fields,
		reminder,
		label = posts.followUps.remindMe,
		variant = 'ghost',
		size = 'md'
	}: Props = $props();
	const s = posts.followUps;
	let picking = $state(false);
</script>

<Menu align="end">
	{#snippet trigger({ props })}
		{#if variant === 'icon'}
			<IconButton
				{...props}
				icon={reminder ? 'alarm-check' : 'alarm'}
				label={reminder ? `${s.set} ${s.setTime(reminder.showAt, page.data.timeZone)}` : label}
				{size}
				quiet
			/>
		{:else}
			<Button {...props} {variant} {size}>
				<Icon name={reminder ? 'alarm-check' : 'alarm'} />
				<span class={{ collapse: variant === 'ghost' }}>
					{#if reminder}
						{s.set}
						<time
							datetime={new Date(reminder.showAt).toISOString()}
							title={s.exactTime(reminder.showAt, page.data.timeZone)}
							>{s.setTime(reminder.showAt, page.data.timeZone)}</time
						>
					{:else}
						{label}
					{/if}
				</span>
			</Button>
		{/if}
	{/snippet}
	<RemindItems {action} {fields} {reminder} oncustom={() => (picking = true)} />
</Menu>

<RemindDialog bind:open={picking} {action} {fields} />

<style>
	/* A phone's titlebar is three columns with the title centred: keep the name for screen
	   readers and show only the icon, so the title has room. */
	@media (max-width: 63.99rem) {
		.collapse {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}
</style>
