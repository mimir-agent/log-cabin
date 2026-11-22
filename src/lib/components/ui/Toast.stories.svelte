<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { core } from '#lib/strings/core.js';
	import Toast, { toast } from './Toast.svelte';

	const { Story } = defineMeta({
		title: 'UI/Toast',
		component: Toast,
		parameters: { layout: 'fullscreen' }
	});
</script>

<Story name="A change that didn't save">
	{#snippet template()}
		<button type="button" onclick={() => toast(core.errors.notSaved)}>Show a toast</button>
		<Toast />
	{/snippet}
</Story>
