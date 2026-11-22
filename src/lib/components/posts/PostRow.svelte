<script lang="ts">
	import { resolve } from '$app/paths';
	import { navigating } from '$app/state';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import type { feed } from '#lib/server/posts/posts.js';
	import { posts } from '#lib/strings/posts.js';

	type FeedItem = Awaited<ReturnType<typeof feed>>['items'][number];

	let { item, showProject = true }: { item: FeedItem; showProject?: boolean } = $props();
</script>

<!-- Campsite's compact post row: avatar, a one-line title, a one-line preview, the project as a
     pill on the right. The whole row is the link; the project pill is its own link above it. -->
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
		<div class="text">
			<h2 class="title">{item.title}</h2>
			<p class="line">
				{#if item.resolvedAt}
					<span class="badge" data-tone="resolved">{posts.feed.resolved}</span>
				{/if}
				{#if item.commentCount > 0}
					<span class="count" title={posts.feed.comments(item.commentCount)}>
						<span aria-hidden="true">{item.commentCount}</span>
						<span class="u:visually-hidden">{posts.feed.comments(item.commentCount)}</span>
					</span>
				{/if}
				<span class="preview">{item.bodyText}</span>
			</p>
		</div>
		{#if showProject}
			<a class="project" href={resolve('/projects/[id]', { id: item.projectId })}>
				{item.projectName}
			</a>
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

	.body {
		display: flex;
		flex: 1;
		gap: var(--gap-md);
		align-items: center;
		min-inline-size: 0;
		pointer-events: none;
	}

	.text {
		display: grid;
		flex: 1;
		gap: 2px;
		min-inline-size: 0;
	}

	.title {
		margin: 0;
		overflow: hidden;
		color: var(--hue-z0-fg);
		font-size: var(--type-prose);
		font-weight: var(--fw-medium);
		line-height: 1.375rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.line {
		display: flex;
		align-items: center;
		min-inline-size: 0;
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: 1.25rem;
	}

	.preview {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* The comment count: an 18px chip before the preview. */
	.count,
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
		font-variant-numeric: tabular-nums;
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

	/* The project: plain text above the title in a narrow list, a 24px pill on the right in a
	   wide one. */
	.project {
		position: relative;
		z-index: 1;
		display: inline-flex;
		flex: none;
		align-items: center;
		max-inline-size: 12rem;
		block-size: 1.5rem;
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
			flex-direction: column-reverse;
			gap: 2px;
			align-items: flex-start;
		}

		.project {
			block-size: auto;
			padding: 0;
			border: 0;
			font-size: var(--type-body);
			line-height: 1.25rem;
		}
	}
</style>
