<script lang="ts" module>
	/** One note as the notes lists draw it: a row of listNotes. */
	export type ListedNote = {
		id: string;
		title: string;
		/** The first lines of its text. */
		excerpt: string;
		/** The version of the note its thumbnail shows; null until one is drawn. */
		thumbnailVersion: number | null;
		authorName: string;
		createdAt: number;
		updatedAt: number;
		lastActivityAt: number;
		projectPermission: 'none' | 'view' | 'edit';
		/** The project it's shared with, when the reader can see that project. */
		projectId: string | null;
		projectName: string | null;
		projectPrivate: boolean | null;
		/** Whether the reader has favorited it. */
		favorite: boolean;
	};
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import { setFavorite } from '#lib/favorites.js';
	import { notes as strings } from '#lib/strings/notes.js';
	import { posts } from '#lib/strings/posts.js';
	import { calendarDay } from '#lib/time-zone.js';

	type Props = {
		notes: ListedNote[];
		/** The order they're in, which picks the day each is grouped under. */
		sort: 'activity' | 'created';
		/** Tags each row with its project. Off on a project's own Docs tab. */
		showProject?: boolean;
	};

	let { notes, sort, showProject = true }: Props = $props();

	// Grouped by the day of the date they're sorted by.
	const groups = $derived.by(() => {
		const out: { key: string; label: string; items: ListedNote[] }[] = [];
		for (const note of notes) {
			const at = new Date(sort === 'created' ? note.createdAt : note.lastActivityAt);
			const key = calendarDay(at, page.data.timeZone);
			const last = out[out.length - 1];
			if (last?.key === key) last.items.push(note);
			else out.push({ key, label: posts.feed.day(at, page.data.timeZone), items: [note] });
		}
		return out;
	});
</script>

<!-- Campsite's notes list: one-line rows grouped by day, each tagged with the project it's
     shared with. -->
{#each groups as group (group.key)}
	<section aria-label={group.label}>
		<div class="day-heading" aria-hidden="true"><span>{group.label}</span></div>
		<ul class="rows" role="list">
			{#each group.items as note (note.id)}
				<li class="row">
					<span class="mark" aria-hidden="true">
						<Icon name={note.projectPermission === 'none' ? 'private-note' : 'note'} size={24} />
					</span>
					<a class="title" href={resolve('/notes/[id]', { id: note.id })}
						>{note.title || strings.editor.titlePlaceholder}</a
					>
					{#if showProject && note.projectId && note.projectName}
						<a class="tag" href={resolve('/projects/[id]', { id: note.projectId })}>
							{note.projectName}
							{#if note.projectPrivate}<Icon name="lock" size={14} />{/if}
						</a>
					{/if}
					<span class="favorite" data-on={note.favorite || undefined}>
						<IconButton
							icon={note.favorite ? 'star-filled' : 'star-outline'}
							label={note.favorite ? strings.note.unfavorite : strings.note.favorite}
							aria-pressed={note.favorite}
							quiet
							onclick={() => setFavorite({ type: 'note', id: note.id }, !note.favorite)}
						/>
					</span>
				</li>
			{/each}
		</ul>
	</section>
{/each}

<style>
	/* Campsite's day heading: 14px medium tertiary, then a hairline to the edge. */
	.day-heading {
		display: flex;
		gap: var(--gap-lg);
		align-items: center;
		padding-block: var(--gap-sm);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		line-height: 1.25rem;
	}

	.day-heading::after {
		flex: 1;
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
		content: '';
	}

	/* minmax(0, 1fr): a long title truncates instead of widening the list past the screen. */
	.rows {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1px;
		margin: 0 calc(var(--gap-sm) * -1);
		padding: var(--gap-sm) 0;
		list-style: none;
	}

	/* A note row, after Campsite's NoteRow: who can see it as a 24px mark, the title at 14px
	   medium on one line, and on the far side the project it's shared with. The title's link
	   covers the whole row; the project tag sits above it as its own link. */
	.row {
		position: relative;
		display: flex;
		gap: 0.75rem;
		align-items: center;
		padding: 0.625rem 0.75rem;
		border-radius: var(--radius-surface);
		color: var(--hue-z0-fg);
		font-size: var(--type-body);
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	.row:hover {
		background-color: var(--hue-hover);
	}

	.row:has(.title:focus-visible) {
		outline: var(--focus-ring-width) solid var(--hue-focus-ring);
		outline-offset: calc(var(--focus-ring-width) * -1);
	}

	.mark {
		display: inline-flex;
		flex: none;
	}

	.title {
		flex: 1;
		overflow: hidden;
		min-inline-size: 0;
		/* Campsite's max-w-lg: a long title stops at 512px rather than running into the tag. */
		max-inline-size: 32rem;
		color: inherit;
		font-weight: var(--fw-medium);
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.title:focus-visible {
		outline: none;
	}

	.title::after {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		content: '';
	}

	/* Favorite: above the row's link, shown on hover and focus and while it's on. */
	.favorite {
		position: relative;
		z-index: 1;
		margin-inline-start: auto;
	}

	@media (hover: hover) {
		.row:not(:hover, :focus-within) .favorite:not([data-on]) {
			opacity: 0;
		}
	}

	/* The project tag: quiet text on a narrow column, a hairline pill from 36rem. */
	.tag {
		position: relative;
		z-index: 1;
		display: inline-flex;
		flex: none;
		gap: 0.25rem;
		align-items: center;
		margin-inline-start: auto;
		color: var(--hue-text-quaternary);
		font-size: var(--type-body);
		text-decoration: none;
		transition: color var(--motion-fast) var(--motion-ease);
	}

	.tag:hover {
		color: var(--hue-z0-fg);
	}

	.tag :global(svg) {
		opacity: 0.8;
	}

	@container (min-width: 36rem) {
		.tag {
			block-size: 1.5rem;
			padding-inline: 0.5rem;
			border: var(--border-w-hairline) solid var(--hue-z0-border);
			border-radius: var(--radius-full);
			color: var(--hue-z0-muted);
			font-size: var(--type-caption);
		}

		.tag:has(:global(svg)) {
			padding-inline-end: 0.375rem;
		}
	}
</style>
