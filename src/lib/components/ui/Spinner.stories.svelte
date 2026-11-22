<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Spinner from './Spinner.svelte';

	const { Story } = defineMeta({
		title: 'UI/Spinner',
		component: Spinner,
		tags: ['autodocs'],
		args: { label: 'Transcribing', showLabel: true }
	});
</script>

<Story name="With label" />

<Story name="Alone" args={{ label: 'Loading preview', showLabel: false }} />
