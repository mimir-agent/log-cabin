<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from './Button.svelte';
	import Popover from './Popover.svelte';

	const { Story } = defineMeta({
		title: 'UI/Popover',
		component: Popover,
		tags: ['autodocs']
	});
</script>

<script lang="ts">
	let column = $state<HTMLElement | null>(null);
	let words = $state<HTMLElement | null>(null);
</script>

<Story name="Default">
	{#snippet template()}
		<Popover open label="Who's here">
			{#snippet trigger({ props })}
				<Button {...props} size="sm">3 here</Button>
			{/snippet}
			<p style="margin: 0">Morgan Lee, Priya Raman and you have this note open.</p>
		</Popover>
	{/snippet}
</Story>

<Story name="Flush content">
	{#snippet template()}
		<Popover open padding="none" width="20rem" label="Seen by">
			{#snippet trigger({ props })}
				<Button {...props} size="sm" variant="ghost">Seen by 12</Button>
			{/snippet}
			<ul style="margin: 0; padding: var(--gap-xs); list-style: none">
				<li style="padding: var(--gap-sm)">Morgan Lee</li>
				<li style="padding: var(--gap-sm)">Priya Raman</li>
			</ul>
		</Popover>
	{/snippet}
</Story>

<!-- Below 1024px this one is a sheet from the bottom edge; at desktop width it is a popover. -->
<Story name="Sheet on small screens">
	{#snippet template()}
		<Popover open sheet padding="none" width="20rem" label="Pick a reaction">
			{#snippet trigger({ props })}
				<Button {...props} size="sm" variant="ghost">React</Button>
			{/snippet}
			<p style="margin: 0; padding: var(--gap-md)">The emoji picker opens like this.</p>
		</Popover>
	{/snippet}
</Story>

<!-- Centred on a button at the column's left edge it would hang past the column; the
     boundary shifts it right so it stays inside, as the emoji picker does in the content column. -->
<Story name="Kept inside an element">
	{#snippet template()}
		<div
			bind:this={column}
			style="margin-inline-start: 12rem; min-block-size: 16rem; outline: var(--border-w-thin) dashed var(--hue-z0-border)"
		>
			<Popover open align="center" width="20rem" label="Inside the column" boundary={column}>
				{#snippet trigger({ props })}
					<Button {...props} size="sm" variant="ghost">React</Button>
				{/snippet}
				<p style="margin: 0">This stays inside the dashed column.</p>
			</Popover>
		</div>
	{/snippet}
</Story>

<!-- With no trigger it hangs from the words it is about, as a comment does from its highlighted
     passage; focus stays in the text. -->
<Story name="Anchored to words">
	{#snippet template()}
		<p style="margin: 0; min-block-size: 8rem; max-inline-size: 28rem">
			Meet at the trailhead by nine, then
			<mark bind:this={words}>take the ridge route</mark> if the weather holds.
		</p>
		<Popover open anchor={words} label="Comment on the passage">
			<p style="margin: 0">Is the ridge open this early in the year?</p>
		</Popover>
	{/snippet}
</Story>
