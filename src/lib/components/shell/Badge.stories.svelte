<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Badge from './Badge.svelte';
	import UnreadDot from './UnreadDot.svelte';

	const { Story } = defineMeta({
		title: 'Shell/Badge',
		component: Badge,
		tags: ['autodocs'],
		args: { tone: 'neutral' },
		argTypes: { tone: { control: 'inline-radio', options: ['neutral', 'unread', 'danger'] } }
	});
</script>

<Story name="Tones">
	{#snippet template()}
		<div style="display: flex; gap: var(--gap-sm); align-items: center">
			<Badge>12</Badge>
			<Badge tone="unread" label="3 unread">3</Badge>
			<Badge tone="danger">Failed</Badge>
			<Badge>Draft</Badge>
		</div>
	{/snippet}
</Story>

<Story name="Large count">
	{#snippet template()}
		<Badge tone="unread" label="128 unread">99+</Badge>
	{/snippet}
</Story>

<Story name="Unread dot">
	{#snippet template()}
		<UnreadDot />
	{/snippet}
</Story>
