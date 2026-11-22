<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
	import Tooltip from './Tooltip.svelte';

	const { Story } = defineMeta({
		title: 'UI/Tooltip',
		component: Tooltip,
		tags: ['autodocs']
	});
</script>

<Story
	name="Label"
	play={async () => {
		await expect(await within(document.body).findByRole('tooltip')).toHaveTextContent('Bold');
	}}
>
	{#snippet template()}
		<Tooltip open label="Bold">
			{#snippet trigger({ props })}
				<button {...props} type="button">B</button>
			{/snippet}
		</Tooltip>
	{/snippet}
</Story>

<Story
	name="With its keys"
	play={async () => {
		const tip = await within(document.body).findByRole('tooltip');
		const keys = tip.querySelector('kbd');
		await expect(keys?.textContent).toMatch(/^(⌘K|Ctrl\+K)$/);
	}}
>
	{#snippet template()}
		<Tooltip open label="Link" shortcut={{ apple: '⌘K', other: 'Ctrl+K' }} side="bottom">
			{#snippet trigger({ props })}
				<button {...props} type="button">Link</button>
			{/snippet}
		</Tooltip>
	{/snippet}
</Story>
