<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SegmentedControl from './SegmentedControl.svelte';

	const { Story } = defineMeta({
		title: 'UI/SegmentedControl',
		component: SegmentedControl,
		tags: ['autodocs']
	});
</script>

<script lang="ts">
	let layout = $state<'speaker' | 'grid'>('speaker');
	let theme = $state<'system' | 'light' | 'dark'>('system');
	let people = $state<'members' | 'requests'>('members');
</script>

<Story name="Call layout">
	{#snippet template()}
		<SegmentedControl
			bind:value={layout}
			label="Layout"
			size="sm"
			options={[
				{ value: 'speaker', label: 'Speaker' },
				{ value: 'grid', label: 'Grid' }
			]}
		/>
	{/snippet}
</Story>

<Story name="Theme">
	{#snippet template()}
		<SegmentedControl
			bind:value={theme}
			label="Theme"
			options={[
				{ value: 'system', label: 'System' },
				{ value: 'light', label: 'Light' },
				{ value: 'dark', label: 'Dark' }
			]}
		/>
	{/snippet}
</Story>

<Story name="With a count">
	{#snippet template()}
		<SegmentedControl
			bind:value={people}
			label="Show"
			options={[
				{ value: 'members', label: 'Members' },
				{ value: 'requests', label: 'Requests', count: 3 }
			]}
		/>
	{/snippet}
</Story>
