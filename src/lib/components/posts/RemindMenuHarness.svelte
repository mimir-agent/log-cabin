<!-- A menu to hold a RemindMenuItem in its test: the row only works inside one. -->
<script lang="ts">
	import Menu from '#lib/components/ui/Menu.svelte';
	import RemindMenuItem from './RemindMenuItem.svelte';

	type Props = {
		reminder?: { id: string };
		oncustom: () => void;
	};

	const { reminder, oncustom }: Props = $props();
</script>

<Menu>
	{#snippet trigger({ props })}
		<button {...props} type="button">More</button>
	{/snippet}
	<RemindMenuItem
		action="/follow-ups?/set"
		fields={{ subjectType: 'note', subjectId: 'n1' }}
		{reminder}
		{oncustom}
	/>
</Menu>
