<script lang="ts" module>
	export type Tile = {
		key: string;
		label: string;
		name: string;
		stream: MediaStream | null;
		muted?: boolean;
		self?: boolean;
		screen?: boolean;
	};

	/**
	 * How many columns and rows the tiles take: the split whose tiles come closest to 4:3 in
	 * the space there is. Campsite's `peerSize` (ActiveCall.tsx, CC BY-NC 4.0).
	 */
	export function fit(count: number, width: number, height: number, gap: number) {
		if (count <= 1 || !width || !height) return { columns: 1, rows: 1 };
		let best = { columns: 1, rows: count, off: Infinity };
		for (let columns = 1; columns <= count; columns++) {
			const rows = Math.ceil(count / columns);
			const ratio = (width - gap * (columns - 1)) / columns / ((height - gap * (rows - 1)) / rows);
			const off = Math.abs(ratio - 4 / 3);
			if (off < best.off && ratio > 0.5) best = { columns, rows, off };
			else if (best.off !== Infinity) break;
		}
		return { columns: best.columns, rows: best.rows };
	}
</script>

<script lang="ts">
	import CallTile from './CallTile.svelte';

	type Props = {
		tiles: Tile[];
		/** speaker: one large tile and a strip of the rest; grid: all the same size. */
		layout: 'speaker' | 'grid';
		/** The tile that gets the large spot in the speaker layout. */
		stage: string | null;
		/** The tile of whoever is talking, ringed in either layout. */
		speaking: string | null;
		/** Shown in the middle while nobody else is here. */
		waiting: string;
	};

	let { tiles, layout, stage, speaking, waiting }: Props = $props();
	const gap = 8;
	let width = $state(0);
	let height = $state(0);

	// Your own camera sits in the corner, as in Campsite; everyone else, and every shared
	// screen yours included, shares the stage.
	const mine = $derived(tiles.find((t) => t.self));
	const main = $derived(tiles.filter((t) => !t.self));
	const speakerView = $derived(layout === 'speaker' && main.length > 1);
	const big = $derived(speakerView ? (main.find((t) => t.key === stage) ?? main[0]) : null);
	const strip = $derived(speakerView ? main.filter((t) => t !== big) : []);
	const grid = $derived(fit(main.length, width, height, gap));
</script>

<div class="stage" data-layout={speakerView ? 'speaker' : 'grid'}>
	{#if main.length === 0}
		<p class="waiting">{waiting}</p>
	{:else if big}
		<div class="big"><CallTile {...big} speaking={big.key === speaking} /></div>
		<div class="strip">
			{#each strip as tile (tile.key)}
				<div class="small"><CallTile {...tile} speaking={tile.key === speaking} /></div>
			{/each}
		</div>
	{:else}
		<div
			class="grid"
			bind:clientWidth={width}
			bind:clientHeight={height}
			style:--columns={grid.columns}
			style:--rows={grid.rows}
			style:--gap="{gap}px"
		>
			{#each main as tile (tile.key)}
				<div class="cell"><CallTile {...tile} speaking={tile.key === speaking} /></div>
			{/each}
		</div>
	{/if}
	{#if mine}
		<div class="corner"><CallTile {...mine} speaking={mine.key === speaking} corner /></div>
	{/if}
</div>

<style>
	.stage {
		position: relative;
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--gap-sm);
		min-block-size: 0;
	}

	.waiting {
		margin: auto;
		color: var(--hue-text-quaternary);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
	}

	.grid {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		gap: var(--gap);
		place-content: center;
		min-block-size: 0;
	}

	.cell {
		inline-size: calc((100% - var(--gap) * (var(--columns) - 1)) / var(--columns));
		block-size: calc((100% - var(--gap) * (var(--rows) - 1)) / var(--rows));
	}

	.big {
		flex: 1;
		min-block-size: 0;
	}

	.strip {
		display: flex;
		flex: none;
		gap: var(--gap-sm);
		justify-content: center;
		block-size: 7.5rem;
		overflow-x: auto;
	}

	.small {
		flex: none;
		aspect-ratio: 4 / 3;
	}

	/* Campsite's corner: a quarter of the stage's width, never more than 200px, 4:3. */
	.corner {
		position: absolute;
		inset-block-end: var(--gap-sm);
		inset-inline-start: var(--gap-sm);
		z-index: 1;
		inline-size: min(25%, 12.5rem);
		aspect-ratio: 4 / 3;
	}
</style>
