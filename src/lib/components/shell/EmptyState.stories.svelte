<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import EmptyState from './EmptyState.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';

	const { Story } = defineMeta({
		title: 'Shell/EmptyState',
		component: EmptyState,
		tags: ['autodocs'],
		args: {
			title: 'No posts yet',
			description:
				'Posts are for updates and decisions the whole team should see. Write the first one.'
		}
	});
</script>

<Story name="Title and description" />

<Story name="Title only" args={{ description: undefined, title: 'Inbox zero' }} />

<Story name="With action">
	{#snippet template(args)}
		<EmptyState {...args}>
			{#snippet action()}<SuedeButton>New post</SuedeButton>{/snippet}
		</EmptyState>
	{/snippet}
</Story>
