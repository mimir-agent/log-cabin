<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import SuedeButton from './SuedeButton.svelte';

	const { Story } = defineMeta({
		title: 'UI/Dialog',
		component: Dialog,
		tags: ['autodocs']
	});
</script>

<Story name="Question (sm)">
	{#snippet template()}
		<Dialog
			open
			size="sm"
			title="Start recording?"
			description="Everyone in the call will see that it's being recorded. The recording and its transcript are saved to Spring catalog."
		>
			{#snippet actions()}
				<Button>Cancel</Button>
				<SuedeButton>Start recording</SuedeButton>
			{/snippet}
		</Dialog>
	{/snippet}
</Story>

<Story name="Form (md)">
	{#snippet template()}
		<Dialog
			open
			title="Invite to the call"
			description="They'll ring until they answer, for 30 seconds."
		>
			<ul style="margin: 0; padding: 0; list-style: none; display: grid; gap: var(--gap-sm)">
				<li><label><input type="checkbox" checked /> Morgan Lee</label></li>
				<li><label><input type="checkbox" /> Priya Raman</label></li>
				<li><label><input type="checkbox" /> Tomás Echeverría-Villanueva</label></li>
			</ul>
			{#snippet actions()}
				<Button>Cancel</Button>
				<SuedeButton>Ring 1 person</SuedeButton>
			{/snippet}
		</Dialog>
	{/snippet}
</Story>

<Story name="With trigger">
	{#snippet template()}
		<Dialog title="Delete this draft?" size="sm" description="It can't be brought back.">
			{#snippet trigger({ props })}
				<Button {...props} variant="danger">Delete draft</Button>
			{/snippet}
			{#snippet actions()}
				<Button>Keep it</Button>
				<Button variant="danger">Delete</Button>
			{/snippet}
		</Dialog>
	{/snippet}
</Story>
