<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Banner from './Banner.svelte';
	import Button from './Button.svelte';

	const { Story } = defineMeta({
		title: 'UI/Banner',
		component: Banner,
		tags: ['autodocs']
	});
</script>

<Story name="Tones">
	{#snippet template()}
		<div style="display: grid; gap: var(--gap-sm); max-inline-size: 40rem">
			<Banner tone="live">
				Recording. Started by Morgan Lee at 10:42.
				{#snippet action()}<Button size="sm">Stop</Button>{/snippet}
			</Banner>
			<Banner tone="warning">
				You're offline. Your edits are kept here and will sync when you reconnect.
			</Banner>
			<Banner tone="danger">
				This note couldn't be saved.
				{#snippet action()}<Button size="sm">Try again</Button>{/snippet}
			</Banner>
			<Banner>You can view this note. Ask Priya Raman to edit it.</Banner>
		</div>
	{/snippet}
</Story>

<Story name="Long message">
	{#snippet template()}
		<div style="max-inline-size: 22rem">
			<Banner tone="live">
				Recording. Audio from everyone in the call is being saved with a transcript to Spring
				catalog, where members of that project can play it back.
				{#snippet action()}<Button size="sm">Stop</Button>{/snippet}
			</Banner>
		</div>
	{/snippet}
</Story>
