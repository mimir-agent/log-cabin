<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Slider from './Slider.svelte';

	const { Story } = defineMeta({
		title: 'UI/Slider',
		component: Slider,
		tags: ['autodocs']
	});
</script>

<Story name="Zoom" args={{ label: 'Zoom', min: 1, max: 4, step: 0.01, value: 1.5 }} />
