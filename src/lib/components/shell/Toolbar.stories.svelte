<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Toolbar from './Toolbar.svelte';
	import ToolbarButton from './ToolbarButton.svelte';
	import ToolbarSeparator from './ToolbarSeparator.svelte';

	const { Story } = defineMeta({
		title: 'Shell/Toolbar',
		component: Toolbar,
		tags: ['autodocs'],
		args: { label: 'Formatting' }
	});
</script>

<Story name="Formatting">
	{#snippet template(args)}
		<Toolbar {...args}>
			<ToolbarButton label="Bold" pressed><b>B</b></ToolbarButton>
			<ToolbarButton label="Italic"><i>I</i></ToolbarButton>
			<ToolbarButton label="Strikethrough"><s>S</s></ToolbarButton>
			<ToolbarSeparator />
			<ToolbarButton label="Bulleted list">List</ToolbarButton>
			<ToolbarButton label="Quote">Quote</ToolbarButton>
			<ToolbarSeparator />
			<ToolbarButton label="Attach" disabled>Attach</ToolbarButton>
		</Toolbar>
	{/snippet}
</Story>
