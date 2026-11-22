<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { ListedNote } from '#lib/components/notes/NoteRows.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import { setFavorite } from '#lib/favorites.js';
	import { notes as strings } from '#lib/strings/notes.js';
	import { time } from '#lib/strings/time.js';

	let { notes }: { notes: ListedNote[] } = $props();
	const s = strings.list;
</script>

<!-- After Campsite's NotesGrid: a card per note, its first lines on a raised page, the title
     and who wrote it under that. Four across, three in a narrower column, two on a phone. -->
<ul class="cards l:grid" role="list">
	{#each notes as note (note.id)}
		<li class="card" data-grid-columns="quarter">
			<!-- Its thumbnail once one is drawn, else its first lines. The title link says what it is,
			     so the picture has no alt text. -->
			<div class="preview" aria-hidden="true">
				{#if note.thumbnailVersion !== null}
					<img
						src={`${resolve('/notes/[id]/thumbnail', { id: note.id })}?size=grid&v=${note.thumbnailVersion}`}
						alt=""
						loading="lazy"
					/>
				{:else}
					{note.excerpt}
				{/if}
			</div>
			<a class="title" href={resolve('/notes/[id]', { id: note.id })}
				>{note.title || strings.editor.titlePlaceholder}</a
			>
			<span class="meta"
				>{s.by(note.authorName)} ·
				<time
					datetime={new Date(note.updatedAt).toISOString()}
					title={time.long(note.updatedAt, page.data.timeZone)}
					>{s.updated(note.updatedAt, page.data.timeZone)}</time
				></span
			>
			<span class="favorite" data-on={note.favorite || undefined}>
				<IconButton
					icon={note.favorite ? 'star-filled' : 'star-outline'}
					label={note.favorite ? strings.note.unfavorite : strings.note.favorite}
					aria-pressed={note.favorite}
					onclick={() => setFavorite({ type: 'note', id: note.id }, !note.favorite)}
				/>
			</span>
		</li>
	{/each}
</ul>

<style>
	.cards {
		--grid-gutter: var(--gap-lg);
		row-gap: var(--gap-xl);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		min-inline-size: 0;
	}

	.preview {
		overflow: hidden;
		display: -webkit-box;
		aspect-ratio: 3 / 4;
		margin-block-end: var(--gap-sm);
		padding: var(--gap-lg);
		border: var(--border-w-hairline) solid var(--hue-z1-border);
		border-radius: var(--radius-card);
		background-color: var(--hue-z1-bg);
		box-shadow: var(--shadow-card);
		color: var(--hue-z1-muted);
		font-size: var(--type-caption);
		line-clamp: 8;
		-webkit-line-clamp: 8;
		-webkit-box-orient: vertical;
	}

	.preview img {
		display: block;
		inline-size: 100%;
		block-size: auto;
	}

	/* The title's link covers the whole card. */
	.title {
		color: var(--hue-z0-fg);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		text-decoration: none;
	}

	.title::after {
		position: absolute;
		inset: 0;
		border-radius: var(--radius-card);
		content: '';
	}

	.title:focus-visible {
		outline: none;
	}

	.card:has(.title:focus-visible) .preview {
		outline: var(--focus-ring-width) solid var(--hue-focus-ring);
	}

	/* Favorite: in the card's corner above its link, shown on hover and focus and while it's on. */
	.favorite {
		position: absolute;
		inset-block-start: var(--gap-sm);
		inset-inline-end: var(--gap-sm);
		z-index: 1;
	}

	@media (hover: hover) {
		.card:not(:hover, :focus-within) .favorite:not([data-on]) {
			opacity: 0;
		}
	}

	.meta {
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}

	@container (max-width: 42rem) {
		.card {
			grid-column: span 4;
		}
	}

	@container (max-width: 30rem) {
		.card {
			grid-column: span 6;
		}
	}
</style>
