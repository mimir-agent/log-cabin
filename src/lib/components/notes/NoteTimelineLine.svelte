<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { IconName } from '#lib/components/ui/icons/campsite-icons.js';
	import type { NoteTimelineEvent } from '#lib/server/notes/timeline.js';
	import { notes } from '#lib/strings/notes.js';
	import { time } from '#lib/strings/time.js';

	type Props = { event: NoteTimelineEvent };

	const { event }: Props = $props();
	const icons: Record<NoteTimelineEvent['kind'], IconName> = {
		project: 'project',
		title: 'pencil',
		pinned: 'pin-tack',
		unpinned: 'pin-tack',
		posted: 'paper-airplane',
		referenced: 'link'
	};
</script>

<!-- One quiet line among a note's comments: what happened to the note, who did it, when. -->
<p class="line">
	<span class="icon"><Icon name={icons[event.kind]} size={16} /></span>
	<span class="what">
		<span class="actor">{event.actorName}</span>
		{notes.timeline[event.kind]}
		{#if event.kind === 'title'}
			<span class="name">{event.title || notes.editor.titlePlaceholder}</span>
		{:else if event.kind === 'referenced'}
			<a
				class="name"
				href={event.ref.type === 'post'
					? resolve('/posts/[id]', { id: event.ref.id })
					: resolve('/notes/[id]', { id: event.ref.id })}
				>{event.ref.title || notes.editor.titlePlaceholder}</a
			>
		{:else}
			<a class="name" href={resolve('/projects/[id]', { id: event.project.id })}
				>{event.project.name}</a
			>
		{/if}
		<time
			datetime={new Date(event.createdAt).toISOString()}
			title={time.long(event.createdAt, page.data.timeZone)}
			>{time.short(event.createdAt, page.data.timeZone)}</time
		>
	</span>
</p>

<style>
	.line {
		display: flex;
		gap: var(--gap-sm);
		align-items: baseline;
		margin: 0;
		padding-inline: var(--gap-md);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
	}

	.icon {
		display: inline-flex;
		flex: none;
		translate: 0 0.1875rem;
	}

	.actor,
	.name {
		color: var(--hue-z0-fg);
		font-weight: var(--fw-medium);
	}

	a.name {
		text-decoration: none;
	}

	a.name:hover {
		text-decoration: underline;
	}

	time {
		margin-inline-start: var(--gap-xs);
		color: var(--hue-text-quaternary);
		font-size: var(--type-caption);
	}
</style>
