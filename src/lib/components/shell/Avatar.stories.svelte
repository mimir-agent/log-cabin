<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Avatar from './Avatar.svelte';

	const { Story } = defineMeta({
		title: 'Shell/Avatar',
		component: Avatar,
		tags: ['autodocs'],
		args: { name: 'Ada Lovelace', size: 'sm', shape: 'round' },
		argTypes: {
			size: { control: 'inline-radio', options: ['xs', 'sm', 'md', 'lg'] },
			shape: { control: 'inline-radio', options: ['round', 'square'] },
			src: { control: 'text' }
		}
	});

	const people = [
		'Ada Lovelace',
		'Grace Hopper',
		'Katherine Johnson',
		'Alan Turing',
		'Hedy Lamarr',
		'Margaret Hamilton',
		'Ōe Kenzaburō',
		'Prince'
	];
</script>

<Story name="Initials" />

<Story name="Sizes">
	{#snippet template(args)}
		<div style="display: flex; gap: var(--gap-md); align-items: center">
			<Avatar {...args} size="xs" />
			<Avatar {...args} size="sm" />
			<Avatar {...args} size="md" />
			<Avatar {...args} size="lg" />
			<Avatar {...args} size="xl" />
		</div>
	{/snippet}
</Story>

<Story name="Tints from names">
	{#snippet template()}
		<div style="display: flex; gap: var(--gap-sm)">
			{#each people as name (name)}
				<Avatar {name} size="md" />
			{/each}
		</div>
	{/snippet}
</Story>

<Story name="Organization (square)" args={{ name: 'Northwind', shape: 'square', size: 'md' }} />

<Story name="Presence">
	{#snippet template()}
		<div style="display: flex; gap: var(--gap-lg); align-items: center">
			<Avatar name="Morgan Lee" size="sm" presence="online" presenceLabel="Active now" />
			<Avatar name="Morgan Lee" size="md" presence="online" presenceLabel="Active now" />
			<Avatar name="Priya Raman" size="lg" presence="online" presenceLabel="Active now" />
			<Avatar name="Wen Zhao" size="lg" presence="paused" presenceLabel="Notifications paused" />
		</div>
	{/snippet}
</Story>

<!-- An empty data URL fails to decode without a request. A missing path would ask the test
	server, which answers with a server error under Vitest. -->
<Story name="Broken image falls back to initials" args={{ src: 'data:image/png;base64,' }} />
