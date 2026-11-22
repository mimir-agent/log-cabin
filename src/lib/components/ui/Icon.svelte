<!--
@component
Renders one of the Campsite icons from `icons/campsite-icons.ts` (run
`node scripts/icons-from-campsite.js` to regenerate). Decorative unless
`label` is set. Colour follows `currentColor`.
-->

<script lang="ts">
	import { icons, type IconData, type IconName } from '#lib/components/ui/icons/campsite-icons.js';

	interface Props {
		name: IconName;
		/** Width and height in pixels. Defaults to the icon's own size, usually 20. */
		size?: number;
		/** Stroke width in viewBox units. Defaults to the icon's own, usually '1.5'. */
		strokeWidth?: string;
		/** Accessible name. Without one the icon is decorative and hidden from assistive tech. */
		label?: string;
	}

	let { name, size, strokeWidth, label }: Props = $props();

	const icon: IconData = $derived(icons[name]);
	const px = $derived(size ?? icon.size);
	const body = $derived(icon.body.replaceAll('{sw}', strokeWidth ?? icon.strokeWidth ?? '1.5'));
</script>

<svg
	width={px}
	height={px}
	viewBox={icon.viewBox}
	fill="none"
	focusable="false"
	aria-hidden={label ? undefined : 'true'}
	role={label ? 'img' : undefined}
	aria-label={label}
	class="icon"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- body is generated static SVG -->
	{@html body}
</svg>

<style>
	.icon {
		flex: none;
		color: currentColor;
	}
</style>
