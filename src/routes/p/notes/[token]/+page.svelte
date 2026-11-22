<script lang="ts">
	import RichText from '#lib/components/editor/RichText.svelte';
	import { attachmentIdOf } from '#lib/editor/doc.js';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import PublicFrame from '#lib/components/shell/PublicFrame.svelte';
	import { notes } from '#lib/strings/notes.js';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	// The body's files are served from this link, not the members-only /files route.
	const fileUrl = (path: string) => data.filesUrl + attachmentIdOf(path);
</script>

<svelte:head>
	<title>{data.title} · {data.orgName}</title>
	<meta name="description" content={data.description} />
	{#if !data.indexable}<meta name="robots" content="noindex" />{/if}
	<meta property="og:type" content="article" />
	<meta property="og:title" content={data.title} />
	<meta property="og:description" content={data.description} />
	<meta property="og:site_name" content={data.orgName} />
	<meta property="og:url" content={data.url} />
	{#if data.ogImage}
		<meta property="og:image" content={data.ogImage.url} />
		<meta property="og:image:width" content={String(data.ogImage.width)} />
		<meta property="og:image:height" content={String(data.ogImage.height)} />
	{/if}
</svelte:head>

<!-- The note as it was last saved, byline then title then body, with nothing around it to use. -->
<PublicFrame orgName={data.orgName} logoUrl={null}>
	<article class="note">
		<p class="byline">
			<Avatar name={data.authorName} size="sm" />
			<span class="author">{data.authorName}</span>
			<time datetime={new Date(data.updatedAt).toISOString()}
				>{notes.publicNote.updated(data.updatedAt, data.timeZone)}</time
			>
		</p>
		<h1 class="title">{data.title}</h1>
		<!-- No custom emoji: their images are for signed-in members, so :name: stays as typed. -->
		<!-- No titles either: a signed-out reader may see none of what the note mentions. -->
		<!-- No note cards: they are for members, who may open the notes. -->
		<RichText doc={data.body} customEmoji={{}} note {fileUrl} resources={{}} noteCards={false} />
	</article>
</PublicFrame>

<style>
	.note {
		display: flex;
		flex-direction: column;
		gap: var(--gap-md);
	}

	/* The public post page's byline and title, so both read the same signed out. */
	.byline {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.375rem;
		align-items: center;
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-prose);
		line-height: 1.5rem;
	}

	.byline :global(.avatar) {
		margin-inline-end: var(--gap-sm);
	}

	.author {
		color: var(--hue-z0-fg);
		font-weight: var(--fw-medium);
	}

	.title {
		margin: var(--gap-xs) 0 0;
		font-size: 1.375rem;
		font-weight: var(--fw-bold);
		line-height: 1.375;
		letter-spacing: -0.01em;
		text-wrap: balance;
		overflow-wrap: anywhere;
	}
</style>
