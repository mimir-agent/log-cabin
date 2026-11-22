<!--
@component
The header of a group that folds away: the sidebar's projects, the people rail's Team and
Guests. Campsite's collapsible button: 24px, a 12px triangle that turns to point down while the
group is open, the label at 12px medium in the tertiary grey. With `storageKey`, the open state
outlives the visit.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '#lib/components/ui/Icon.svelte';

	type Props = {
		open?: boolean;
		/** The id of the element this shows and hides. */
		controls: string;
		/** Keeps the open state in localStorage under this key. */
		storageKey?: string;
		children: Snippet;
	};

	let { open = $bindable(true), controls, storageKey, children }: Props = $props();

	$effect(() => {
		if (storageKey) open = localStorage.getItem(storageKey) !== 'closed';
	});

	function toggle() {
		open = !open;
		if (storageKey) localStorage.setItem(storageKey, open ? 'open' : 'closed');
	}
</script>

<button
	type="button"
	class="toggle"
	aria-expanded={open}
	aria-controls={controls}
	data-focus="inset"
	data-press
	onclick={toggle}
>
	<span class="triangle" aria-hidden="true"><Icon name="play" size={12} /></span>
	{@render children()}
</button>

<style>
	.toggle {
		display: flex;
		flex: 1;
		align-items: center;
		min-inline-size: 0;
		block-size: 1.5rem;
		padding: var(--gap-xs) var(--gap-sm);
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--hue-z0-muted);
		font: inherit;
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
		line-height: 1rem;
		text-align: start;
		cursor: pointer;
	}

	.toggle:hover {
		background-color: var(--hue-selected);
	}

	.triangle {
		display: grid;
		flex: none;
		margin-inline-end: 0.375rem;
		color: var(--hue-text-quaternary);
		transition: rotate 200ms var(--motion-ease);
	}

	.toggle[aria-expanded='true'] .triangle {
		rotate: 90deg;
	}

	@media (prefers-reduced-motion: reduce) {
		.triangle {
			transition: none;
		}
	}
</style>
