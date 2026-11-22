<script lang="ts">
	import { resolve } from '$app/paths';
	import { navigating } from '$app/state';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { feed } from '#lib/server/posts/posts.js';
	import { posts } from '#lib/strings/posts.js';
	import { time } from '#lib/strings/time.js';

	type FeedItem = Awaited<ReturnType<typeof feed>>['items'][number];

	let {
		item,
		showProject = true,
		timeZone
	}: { item: FeedItem; showProject?: boolean; timeZone: string } = $props();
</script>

<!-- A post is a moment: who, when, and what came back. The whole row is the link; the project
     pill is its own link above it. The time and the answers share the last grid column, so both
     lines end at one edge. -->
<article class="row">
	<a
		class="hit"
		href={resolve('/posts/[id]', { id: item.id })}
		data-focus="inset"
		data-pending={navigating.to?.params?.id === item.id || undefined}
	>
		<span class="u:visually-hidden">{item.title}</span>
	</a>
	<span class="avatar"><Avatar name={item.authorName} src={item.authorAvatarUrl} size="lg" /></span>
	<div class="body">
		<h2 class="title">{item.title}</h2>
		<time class="time" datetime={new Date(item.lastActivityAt).toISOString()}>
			{time.clock(item.lastActivityAt, timeZone)}
		</time>
		<p class="line">
			{#if item.resolvedAt}
				<span class="badge" data-tone="resolved">{posts.feed.resolved}</span>
			{/if}
			<span class="author">{item.authorName}</span>
			<span class="preview">{item.bodyText}</span>
		</p>
		{#if showProject}
			<a class="project" href={resolve('/projects/[id]', { id: item.projectId })}>
				{item.projectName}
			</a>
		{/if}
		{#if item.commentCount > 0}
			<span class="answers" title={posts.feed.comments(item.commentCount)}>
				<span class="faces" aria-hidden="true">
					{#each item.answerers as person (person.id)}
						<span class="face"><Avatar name={person.name} src={person.avatarUrl} size="xs" /></span>
					{/each}
				</span>
				<Icon name="post" size={14} />
				<span aria-hidden="true">{item.commentCount}</span>
				<span class="u:visually-hidden">{posts.feed.comments(item.commentCount)}</span>
			</span>
		{/if}
	</div>
</article>

<style>
	.row {
		position: relative;
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		min-block-size: 3rem;
		padding: var(--gap-md);
		border-radius: var(--radius-surface);
		container-type: inline-size;
		transition: background-color 150ms ease-out;
	}

	@container (min-width: 36rem) {
		.body {
			padding-inline-end: var(--gap-xs);
		}
	}

	.row:hover,
	.row:has(.hit:focus-visible) {
		background-color: var(--hue-hover);
		box-shadow: var(--shadow-select-item);
	}

	.row:has(.hit:active, .hit[data-pending]) {
		background-color: var(--hue-pressed);
		transition-duration: var(--motion-instant);
	}

	/* The link covers the row; the project pill sits above it so it stays its own link. */
	.hit {
		position: absolute;
		inset: 0;
		z-index: 0;
		border-radius: inherit;
	}

	.avatar {
		display: flex;
		align-self: flex-start;
		margin-block-start: 2px;
		pointer-events: none;
	}

	/* Two lines over three columns. The last column holds the time on line 1 and the answers on
	   line 2, and is as wide as the wider of them, so both end at the row's right edge. */
	.body {
		display: grid;
		flex: 1;
		grid-template-columns: minmax(0, 1fr) auto auto;
		grid-template-areas:
			'title title time'
			'line project answers';
		align-items: center;
		min-inline-size: 0;
		pointer-events: none;
	}

	.title {
		grid-area: title;
		margin: 0;
		overflow: hidden;
		color: var(--hue-z0-fg);
		font-size: var(--type-prose);
		font-weight: var(--fw-medium);
		line-height: 1.375rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.time {
		grid-area: time;
		justify-self: end;
		margin-inline-start: var(--gap-md);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-variant-numeric: tabular-nums;
		line-height: 1.375rem;
		white-space: nowrap;
	}

	.line {
		grid-area: line;
		display: flex;
		align-items: center;
		min-inline-size: 0;
		margin: 2px 0 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: 1.25rem;
	}

	.author {
		flex: 0 1 auto;
		min-inline-size: 0;
		max-inline-size: 50%;
		margin-inline-end: var(--gap-sm);
		overflow: hidden;
		color: var(--hue-z0-fg);
		font-weight: var(--fw-medium);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.preview {
		flex: 1;
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.badge {
		display: inline-flex;
		flex: none;
		align-items: center;
		block-size: 1.125rem;
		margin-inline-end: var(--gap-sm);
		padding-inline: 0.375rem;
		border-radius: var(--radius-xs, 0.25rem);
		background-color: var(--hue-border-tertiary);
		font-size: 0.625rem;
		font-weight: var(--fw-semibold);
		line-height: 1;
		text-transform: uppercase;
	}

	.badge[data-tone='resolved'] {
		background-color: light-dark(
			var(--hue-green-100),
			color-mix(in srgb, var(--hue-green-500) 20%, transparent)
		);
		color: var(--hue-success);
	}

	/* Who answered, the bubble and the count: nothing at all when no one has. */
	.answers {
		grid-area: answers;
		justify-self: end;
		display: inline-flex;
		gap: var(--gap-xs);
		align-items: center;
		margin: 2px 0 0 var(--gap-md);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-variant-numeric: tabular-nums;
		line-height: 1.25rem;
	}

	.faces {
		display: inline-flex;
		margin-inline-end: var(--gap-xs);
	}

	.face {
		display: inline-flex;
		border-radius: var(--radius-full);
		/* A ring of the page colour cuts each face out of the one under it. */
		box-shadow: 0 0 0 2px var(--hue-z0-bg);
	}

	.face + .face {
		margin-inline-start: -5px;
	}

	.face :global(.avatar[data-size][data-shape]) {
		--avatar-size: 1.125rem;
	}

	/* The project: plain text above the title in a narrow list, a 24px pill left of the answers
	   in a wide one. */
	.project {
		grid-area: project;
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		max-inline-size: 12rem;
		block-size: 1.5rem;
		margin: 2px 0 0 var(--gap-md);
		padding-inline: var(--gap-sm);
		overflow: hidden;
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-full);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		line-height: 1;
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
		pointer-events: auto;
	}

	.project:hover {
		color: var(--hue-z0-fg);
	}

	@container (max-width: 35.99rem) {
		.body {
			grid-template-areas:
				'project project project'
				'title title time'
				'line line answers';
		}

		.project {
			justify-self: start;
			block-size: auto;
			margin: 0 0 2px;
			padding: 0;
			border: 0;
			font-size: var(--type-body);
			line-height: 1.25rem;
		}
	}
</style>
