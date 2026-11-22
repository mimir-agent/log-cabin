<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PageHeader from './PageHeader.svelte';
	import Toolbar from './Toolbar.svelte';
	import ToolbarButton from './ToolbarButton.svelte';

	const { Story } = defineMeta({
		title: 'Shell/PageHeader',
		component: PageHeader,
		tags: ['autodocs'],
		args: { title: 'Posts' }
	});
</script>

<Story name="Title only" />

<Story name="With description and actions">
	{#snippet template(args)}
		<PageHeader {...args}>
			{#snippet description()}All projects · 214 posts{/snippet}
			{#snippet actions()}
				<Toolbar label="Page actions">
					<ToolbarButton label="Filter">Filter</ToolbarButton>
					<ToolbarButton label="New post">New post</ToolbarButton>
				</Toolbar>
			{/snippet}
		</PageHeader>
	{/snippet}
</Story>

<Story name="Long title truncates">
	{#snippet template()}
		<div style="max-inline-size: 24rem">
			<PageHeader
				title="Quarterly planning: what we're cutting, what we're keeping, and why the roadmap moved"
			>
				{#snippet description()}Design · Updated 2 hours ago by Grace Hopper{/snippet}
			</PageHeader>
		</div>
	{/snippet}
</Story>
