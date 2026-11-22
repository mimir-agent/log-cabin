<script lang="ts">
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { calls as strings } from '#lib/strings/calls.js';

	type Props = {
		/** Who the tile is, as shown on it. */
		label: string;
		/** The person's name, for the avatar shown while there's no picture. */
		name: string;
		/** Video to show; without one, the avatar shows. */
		stream: MediaStream | null;
		muted?: boolean;
		/** A screen share: shown whole, never cropped or mirrored. */
		screen?: boolean;
		/** Your own camera, shown mirrored the way a mirror would. */
		self?: boolean;
		/** Ringed while this person is the one talking. */
		speaking?: boolean;
		/** Your own tile tucked into the stage's corner: smaller face, no name. */
		corner?: boolean;
	};

	let {
		label,
		name,
		stream,
		muted = false,
		screen = false,
		self = false,
		speaking = false,
		corner = false
	}: Props = $props();
	// The page hands over a fresh tile on every change in the call, a mute anywhere included.
	// Through a derived, the video is given its stream again only when it's a different one:
	// each time it's given one, it starts over, blank for a frame or two.
	const source = $derived(stream);
</script>

<!-- After Campsite's CallPeer (CC BY-NC 4.0): a rounded tile on the dark stage, the name in
     white at the bottom right, a muted mark at the top right, and a green ring on whoever is
     talking. -->
<figure
	class="tile"
	data-screen={screen ? '' : undefined}
	data-speaking={speaking ? '' : undefined}
	data-corner={corner ? '' : undefined}
	data-video={stream ? '' : undefined}
>
	{#if stream}
		<video
			{@attach (video) => {
				video.srcObject = source;
			}}
			autoplay
			playsinline
			muted
			data-self={self ? '' : undefined}
		></video>
	{:else}
		<Avatar {name} size={corner ? 'lg' : 'xl'} />
	{/if}
	{#if muted}
		<span class="badge" role="img" aria-label={strings.room.muted}>
			<Icon name="microphone-mute" size={20} />
		</span>
	{/if}
	<figcaption class={corner ? 'u:visually-hidden' : 'name'}>{label}</figcaption>
</figure>

<style>
	.tile {
		position: relative;
		isolation: isolate;
		display: grid;
		place-items: center;
		inline-size: 100%;
		block-size: 100%;
		margin: 0;
		overflow: hidden;
		border-radius: var(--radius-surface);
		background-color: var(--hue-z1-bg);
		color: var(--hue-white);
	}

	/* The speaking ring sits over the video, so a bright picture can't hide it. */
	.tile::after {
		position: absolute;
		inset: 0;
		z-index: 2;
		border-radius: inherit;
		box-shadow: inset 0 0 0 var(--border-w-standard) var(--hue-speaking);
		opacity: 0;
		content: '';
		pointer-events: none;
		transition: opacity var(--motion-fast) var(--motion-ease);
	}

	.tile[data-speaking]::after {
		opacity: 1;
	}

	video {
		position: absolute;
		inset: 0;
		inline-size: 100%;
		block-size: 100%;
		object-fit: cover;
	}

	video[data-self] {
		transform: scaleX(-1);
	}

	.tile[data-screen] video {
		object-fit: contain;
	}

	.name {
		position: absolute;
		inset-block-end: 0.625rem;
		inset-inline-end: 0.625rem;
		z-index: 1;
		max-inline-size: calc(100% - 1.25rem);
		overflow: hidden;
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		text-overflow: ellipsis;
		text-shadow: 0 1px 1px rgb(0 0 0 / 0.24);
		white-space: nowrap;
		opacity: 0.8;
		transition: opacity var(--motion-fast) var(--motion-ease);
	}

	.tile:hover .name {
		opacity: 1;
	}

	.badge {
		position: absolute;
		inset-block-start: 0.375rem;
		inset-inline-end: 0.375rem;
		z-index: 1;
		display: grid;
		padding: var(--gap-xs);
		border-radius: var(--radius-control);
		background-color: rgb(255 255 255 / 0.1);
		backdrop-filter: blur(16px);
	}

	.tile[data-video] .badge {
		background-color: rgb(0 0 0 / 0.5);
	}

	/* Your own tile in the corner: glassy, and lifted off the stage with Campsite's shadow. */
	.tile[data-corner] {
		background-color: rgb(0 0 0 / 0.7);
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 0.04),
			inset 0 0 0 1px rgb(255 255 255 / 0.1),
			0 1px 2px rgb(0 0 0 / 0.12),
			0 2px 4px rgb(0 0 0 / 0.08),
			0 0 0 0.5px rgb(0 0 0 / 0.24);
		backdrop-filter: blur(12px);
	}
</style>
