<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Switch from './Switch.svelte';

	const { Story } = defineMeta({
		title: 'UI/Switch',
		component: Switch,
		tags: ['autodocs']
	});
</script>

<Story name="Off" args={{ label: 'Noise cancellation' }} />

<Story
	name="On, with a description"
	args={{
		label: 'Quiet hours',
		description: 'Push and email wait until the window ends. Your inbox still fills.',
		checked: true
	}}
/>

<Story name="Settings list">
	{#snippet template()}
		<div style="display: grid; gap: var(--gap-lg); max-inline-size: 28rem">
			<Switch label="Quiet hours" description="Weekdays 18:00 to 09:00, your time." checked />
			<Switch
				label="Public link"
				description="Anyone with the link can read this post, signed in or not."
			/>
			<Switch label="Noise cancellation" disabled />
		</div>
	{/snippet}
</Story>

<!-- Several switches under one name, each with its own value: the form gets every value that's on. -->
<Story name="One name, several values">
	{#snippet template()}
		<form style="display: grid; gap: var(--gap-lg); max-inline-size: 28rem">
			<Switch label="Design" name="project" value="design" checked />
			<Switch label="Launch" name="project" value="launch" />
			<Switch label="Hiring" name="project" value="hiring" checked />
		</form>
	{/snippet}
</Story>
