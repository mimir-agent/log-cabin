<!--
@component
Who did it, and why it reached you: a 24px avatar with a 16px badge on its corner, as Campsite's
inbox and activity rows show it. The avatar is clipped around the badge, so it sits on any row
colour.
-->
<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { IconName } from '#lib/components/ui/icons/campsite-icons.js';
	import Avatar from './Avatar.svelte';

	type Props = {
		name: string;
		icon: IconName;
		/** neutral grey, mention yellow, blue (notes, messages), green (calls, resolved), brand (feedback). */
		tone?: 'neutral' | 'mention' | 'blue' | 'green' | 'brand';
	};

	let { name, icon, tone = 'neutral' }: Props = $props();
</script>

<span class="who">
	<Avatar {name} size="sm" />
	<span class="reason" data-tone={tone} data-icon={icon} aria-hidden="true">
		<Icon name={icon} size={12} strokeWidth="2" />
	</span>
</span>

<style>
	.who {
		position: relative;
		display: flex;
		flex: none;
		align-self: flex-start;
		margin-block-start: 2px;
		pointer-events: none;
	}

	/* Campsite clips the avatar around the badge (its notificationReason clip path), so the
	   cut-out shows whatever is behind the row: the page, a hovered row, a selected one. A
	   ring of the page colour would show as a dark halo on hover. The badge's centre is 21px
	   in (24 + 5 − 8), and the gap around it is 2px. */
	.who > :global(:first-child) {
		mask: radial-gradient(circle 10px at 21px 21px, transparent 99%, #000 100%);
	}

	.reason {
		position: absolute;
		inset-block-end: -5px;
		inset-inline-end: -5px;
		display: grid;
		place-items: center;
		inline-size: 1rem;
		block-size: 1rem;
		border-radius: var(--radius-full);
		/* Campsite's black/10 and white/15: the row's own colour shows through. */
		background-color: light-dark(
			color-mix(in srgb, var(--hue-black) 10%, transparent),
			color-mix(in srgb, var(--hue-white) 15%, transparent)
		);
		color: var(--hue-text-secondary);
	}

	.reason[data-tone='mention'] {
		background-color: light-dark(
			color-mix(in srgb, #eab308 40%, var(--hue-white)),
			color-mix(in srgb, #eab308 40%, var(--hue-gray-950))
		);
		color: light-dark(#713f12, #fef9c3);
	}

	.reason[data-tone='blue'] {
		background-color: var(--hue-unread);
		color: var(--hue-white);
	}

	.reason[data-tone='brand'] {
		background-color: var(--hue-accent);
		color: var(--hue-accent-fg);
	}

	.reason[data-tone='green'] {
		background-color: light-dark(#22c55e, #16a34a);
		color: var(--hue-white);
	}
</style>
