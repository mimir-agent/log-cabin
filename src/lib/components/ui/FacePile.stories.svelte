<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import FacePile from './FacePile.svelte';

	const people = [
		{ id: '1', name: 'Morgan Lee' },
		{ id: '2', name: 'Priya Raman' },
		{ id: '3', name: 'Tomás Echeverría' },
		{ id: '4', name: 'Ada Okafor' },
		{ id: '5', name: 'Wen Zhao' },
		{ id: '6', name: 'Sam Brooks' }
	];

	const { Story } = defineMeta({
		title: 'UI/FacePile',
		component: FacePile,
		tags: ['autodocs'],
		args: { people, label: '6 people', limit: 3, size: 'sm' },
		argTypes: { size: { control: 'inline-radio', options: ['xs', 'sm', 'md'] } }
	});
</script>

<Story name="Overflow" />

<Story
	name="One over the limit shows the face"
	args={{ people: people.slice(0, 4), label: '4 people' }}
/>

<Story
	name="Some away"
	args={{
		people: people.map((p, i) => ({ ...p, away: i > 1 })),
		limit: 6,
		label: '2 here, 4 seen it'
	}}
/>

<Story
	name="Live note (person colours)"
	args={{
		people: [
			{ id: '1', name: 'Morgan Lee', hue: 'blue' },
			{ id: '2', name: 'Priya Raman', hue: 'pink' },
			{ id: '3', name: 'Tomás Echeverría', hue: 'teal' }
		],
		label: '3 people editing',
		size: 'sm'
	}}
/>

<Story name="Sizes">
	{#snippet template()}
		<div style="display: grid; gap: var(--gap-md); justify-items: start">
			<FacePile {people} size="xs" label="6 people" />
			<FacePile {people} size="sm" label="6 people" />
			<FacePile {people} size="md" label="6 people" />
		</div>
	{/snippet}
</Story>
