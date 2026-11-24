<script lang="ts">
	import Avatar from '#lib/components/shell/Avatar.svelte';

	type Person = {
		id: string;
		name: string;
		src?: string | null;
		/** Makes the face a link, to the person's profile. */
		href?: string;
		/** Shown faded: seen it before but not here now, or invited but not joined. */
		away?: boolean;
		/** Their person colour (a note's live cursors): the ring around the face takes it, so a face matches its caret. */
		hue?: string;
	};

	type Props = {
		people: Person[];
		/** Faces shown before the rest collapse into "+N". */
		limit?: number;
		size?: 'xs' | 'sm' | 'md';
		/** Names the group for screen readers: "4 people editing", "Voted by 3 people". */
		label: string;
		/** The surface behind it, so the rings that separate faces match (z0, z1, z2). */
		surface?: 'z0' | 'z1' | 'z2';
	};

	let { people, limit = 3, size = 'sm', label, surface = 'z0' }: Props = $props();

	// "+1" costs the same room as the face it hides, so show the face instead.
	const shown = $derived(people.length === limit + 1 ? people : people.slice(0, limit));
	const rest = $derived(people.slice(shown.length));
</script>

<ul class="pile" data-size={size} aria-label={label} style:--ring="var(--hue-{surface}-bg)">
	{#each shown as person (person.id)}
		<li
			class="face"
			data-away={person.away ? '' : undefined}
			data-hue={person.hue}
			title={person.name}
		>
			{#if person.href}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the caller resolved it -->
				<a href={person.href} class="person" aria-label={person.name}
					><Avatar name={person.name} src={person.src} {size} /></a
				>
			{:else}
				<Avatar name={person.name} src={person.src} {size} />
			{/if}
		</li>
	{/each}
	{#if rest.length > 0}
		<li class="more" title={rest.map((p) => p.name).join(', ')}>
			<span aria-hidden="true">+{rest.length}</span>
			<span class="u:visually-hidden">{rest.map((p) => p.name).join(', ')}</span>
		</li>
	{/if}
</ul>

<style>
	.pile {
		--face: var(--gap-xl);
		--overlap: calc(var(--face) * -0.25);
		display: inline-flex;
		align-items: center;
		margin: 0;
		padding: 0;
		padding-inline-start: calc(var(--overlap) * -1);
		list-style: none;
	}

	.pile[data-size='xs'] {
		--face: var(--gap-lg);
	}

	.pile[data-size='md'] {
		--face: var(--control-h-md);
	}

	.face,
	.more {
		display: inline-grid;
		margin-inline-start: var(--overlap);
		border-radius: var(--radius-full);
		/* A ring of the surface colour cuts each face out of the one under it. */
		box-shadow: 0 0 0 var(--border-w-standard) var(--ring);
	}

	.person {
		display: inline-grid;
		border-radius: var(--radius-full);
	}

	.face[data-away] {
		opacity: 0.5;
		filter: saturate(0.1);
	}

	/* Person colour: the surface ring stays (it separates the faces), their colour sits inside it. */
	.face[data-hue] {
		box-shadow:
			0 0 0 var(--border-w-standard) var(--person),
			0 0 0 calc(var(--border-w-standard) * 2) var(--ring);
	}

	.more {
		place-items: center;
		min-inline-size: var(--face);
		block-size: var(--face);
		padding-inline: calc(var(--face) * 0.2);
		background-color: var(--hue-z1-bg);
		color: var(--hue-z1-muted);
		font-size: max(0.625rem, calc(var(--face) * 0.42));
		font-weight: var(--fw-medium);
		font-variant-numeric: tabular-nums;
		line-height: var(--leading-ui);
	}
</style>
