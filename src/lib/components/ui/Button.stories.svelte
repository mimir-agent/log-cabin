<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from './Button.svelte';
	import SuedeButton from './SuedeButton.svelte';

	const { Story } = defineMeta({
		title: 'UI/Button',
		component: Button,
		tags: ['autodocs'],
		args: { variant: 'secondary', size: 'md' },
		argTypes: {
			variant: { control: 'inline-radio', options: ['secondary', 'ghost', 'danger'] },
			size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] }
		}
	});
</script>

<Story name="Variants">
	{#snippet template()}
		<div style="display: flex; gap: var(--gap-sm); align-items: center; flex-wrap: wrap">
			<Button>Cancel</Button>
			<Button variant="ghost">Skip for now</Button>
			<Button variant="danger">Delete draft</Button>
			<SuedeButton>Publish</SuedeButton>
		</div>
	{/snippet}
</Story>

<Story name="Sizes">
	{#snippet template()}
		<div style="display: flex; gap: var(--gap-sm); align-items: center">
			<Button size="sm">Decline</Button>
			<Button>Decline</Button>
			<Button size="lg">Decline</Button>
		</div>
	{/snippet}
</Story>

<Story name="Toggle">
	{#snippet template()}
		<div style="display: flex; gap: var(--gap-sm); align-items: center">
			<Button size="lg" pressed={false}>Mute</Button>
			<Button size="lg" pressed>Unmute</Button>
		</div>
	{/snippet}
</Story>

<Story name="Disabled">
	{#snippet template()}
		<div style="display: flex; gap: var(--gap-sm); align-items: center">
			<Button disabled>Stopping…</Button>
			<Button href="/drafts" disabled>Drafts</Button>
		</div>
	{/snippet}
</Story>
