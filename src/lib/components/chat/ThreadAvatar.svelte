<script lang="ts">
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';

	type Props = {
		/** The other people in the thread, first three by name. */
		faces: string[];
		/** A group or a channel, as opposed to a direct message. */
		group: boolean;
		/** A group's own picture, shown instead of its faces. */
		src?: string | null;
		/** lg 40 in the thread list, md 32 in the titlebar, xs 20 in the sidebar. */
		size?: 'xs' | 'md' | 'lg';
	};

	let { faces, group, src = null, size = 'lg' }: Props = $props();

	// Campsite's cluster: faces of different sizes tucked into one grey circle, each placed by
	// its centre and size as a fraction of the circle (MultiUserAvatar, ThreadAvatar/index.tsx).
	const layouts: Record<number, { x: number; y: number; f: number }[]> = {
		2: [
			{ x: 0.375, y: 0.375, f: 0.48 },
			{ x: 0.7, y: 0.7, f: 0.34 }
		],
		3: [
			{ x: 0.375, y: 0.375, f: 0.49 },
			{ x: 0.775, y: 0.5, f: 0.3 },
			{ x: 0.525, y: 0.775, f: 0.28 }
		]
	};
	const cluster = $derived(group ? layouts[Math.min(faces.length, 3)] : undefined);
</script>

<!-- The thread's name is always beside it in text, so the faces are decoration. -->
<span class="thread-avatar" data-size={size} aria-hidden="true">
	{#if group && src}
		<Avatar name={faces[0] ?? ''} {src} {size} />
	{:else if !group && faces[0]}
		<Avatar name={faces[0]} {size} />
	{:else if cluster}
		<span class="cluster">
			{#each cluster as spot, i (i)}
				<span class="spot" style:--x={spot.x} style:--y={spot.y} style:--f={spot.f}>
					<Avatar name={faces[i]} size="lg" />
				</span>
			{/each}
		</span>
	{:else}
		<span class="fallback"><Icon name="chat-bubble" strokeWidth="2" /></span>
	{/if}
</span>

<style>
	.thread-avatar {
		--box: var(--control-h-lg);
		--k: 1;

		display: inline-flex;
		flex: none;
		inline-size: var(--box);
		block-size: var(--box);
	}

	.thread-avatar[data-size='md'] {
		--box: var(--control-h-md);
		--k: 0.8;
	}

	/* The sidebar's 20px leading box, Avatar's xs. */
	.thread-avatar[data-size='xs'] {
		--box: 1.25rem;
		--k: 0.5;
	}

	.cluster,
	.fallback {
		position: relative;
		display: grid;
		place-items: center;
		inline-size: 100%;
		block-size: 100%;
		border-radius: var(--radius-full);
		background-color: var(--hue-hover);
		color: var(--hue-z0-muted);
	}

	/* Each face is a full 40px avatar scaled down around its centre, as Campsite does, so the
	   initial keeps its proportions at every size. */
	.spot {
		position: absolute;
		inset-block-start: calc(var(--y) * var(--box) - var(--control-h-lg) / 2);
		inset-inline-start: calc(var(--x) * var(--box) - var(--control-h-lg) / 2);
		display: flex;
		scale: calc(var(--f) * var(--k));
	}
</style>
