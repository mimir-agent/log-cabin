<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Avatar from './Avatar.svelte';
	import ListRow from './ListRow.svelte';

	const { Story } = defineMeta({
		title: 'Shell/ListRow',
		component: ListRow,
		tags: ['autodocs']
	});

	const rows = [
		{
			who: 'Grace Hopper',
			title: 'Launch checklist for the March release',
			excerpt: 'Three blockers left: the migration, the billing copy, and the status page.',
			time: '9:41',
			unread: true
		},
		{
			who: 'Alan Turing',
			title: 'Retro notes',
			excerpt: 'What went well, what didn’t, and what we’ll try next sprint.',
			time: 'Tue',
			unread: false
		},
		{
			who: 'Katherine Johnson',
			title:
				'A very long title that keeps going past the edge of the column so we can see how it truncates on one line',
			excerpt:
				'And an excerpt that is also far too long for the row, because people write long first lines and the row has to hold.',
			time: 'Mar 3',
			unread: false
		}
	];
</script>

<Story name="Inbox list">
	{#snippet template()}
		<div style="max-inline-size: 40rem">
			{#each rows as row, index (row.title)}
				<ListRow href="#{index}" unread={row.unread} selected={index === 1}>
					{#snippet leading()}<Avatar name={row.who} size="md" />{/snippet}
					{row.title}
					{#snippet description()}{row.who} · {row.excerpt}{/snippet}
					{#snippet meta()}<time>{row.time}</time>{/snippet}
				</ListRow>
			{/each}
		</div>
	{/snippet}
</Story>

<Story name="Static, title only">
	{#snippet template()}
		<div style="max-inline-size: 40rem">
			<ListRow>Design</ListRow>
			<ListRow>Engineering</ListRow>
		</div>
	{/snippet}
</Story>
