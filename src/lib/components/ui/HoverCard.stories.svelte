<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import HoverCard from './HoverCard.svelte';

	const { Story } = defineMeta({
		title: 'UI/HoverCard',
		component: HoverCard,
		tags: ['autodocs']
	});
</script>

<Story name="On a name">
	{#snippet template()}
		<HoverCard open>
			{#snippet trigger({ props })}
				<a {...props} href="#morgan">Morgan Lee</a>
			{/snippet}
			<strong>Morgan Lee</strong>
			<span>🎧 Heads down until 3pm</span>
		</HoverCard>
	{/snippet}
</Story>
