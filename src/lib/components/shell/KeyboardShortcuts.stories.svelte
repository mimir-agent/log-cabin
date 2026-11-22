<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import KeyboardShortcuts from './KeyboardShortcuts.svelte';

	const { Story } = defineMeta({
		title: 'Shell/KeyboardShortcuts',
		component: KeyboardShortcuts,
		tags: ['autodocs'],
		args: { open: true }
	});
</script>

<Story name="Sheet" args={{ canCreate: true }} />

<Story name="Sheet without a project" />
