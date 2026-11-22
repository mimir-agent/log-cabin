<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		attachmentPath,
		bareLink,
		docImages,
		maxLinkPreviews,
		resourceKey,
		taskItems,
		withGalleries,
		type DocMark,
		type DocNode,
		type ResourceKind,
		type ResourceRef,
		type ResourceTitles
	} from '#lib/editor/doc.js';
	import { inlineParts } from '#lib/editor/inline.js';
	import type { Highlighted, highlightCode } from '#lib/editor/highlight.js';
	import { editor as text } from '#lib/strings/editor.js';
	import type { Snippet } from 'svelte';
	import Lightbox from './Lightbox.svelte';
	import LinkPreview from './LinkPreview.svelte';
	import NoteLinkCard from '#lib/components/notes/NoteLinkCard.svelte';
	import ResourceChip from './ResourceChip.svelte';

	type Props = {
		doc: DocNode;
		/** The org's own emoji, :name: → image URL, shown in place of their names. */
		customEmoji: Record<string, string>;
		compact?: boolean;
		note?: boolean;
		/** A post's body: the long-form line at the base size. */
		post?: boolean;
		/** Draws each image instead of a plain <img>, e.g. with comments pinned to it. */
		image?: Snippet<[{ src: string; alt: string }]>;
		/** Ticks or clears the index-th task item; without it checkboxes are read-only. */
		ontick?: (index: number, checked: boolean) => void;
		/** Link #tags to their tag page: on for post bodies, whose tags are indexed. */
		tags?: boolean;
		/** Where a file in the body is served from; the public post page serves its own. */
		fileUrl?: (path: string) => string;
		/**
		 * The titles of the notes, posts and calls the body mentions that this reader may see
		 * (resourceTitles); any other shows as unavailable, with no title and no link.
		 */
		resources?: ResourceTitles;
		/**
		 * Shows a card on hovering or focusing a link to a note (NoteLinkCard). Off on pages read
		 * signed out.
		 */
		noteCards?: boolean;
	};

	const {
		doc,
		customEmoji,
		compact = false,
		note = false,
		post = false,
		image,
		ontick,
		tags = false,
		fileUrl = (path) => path,
		resources = {},
		noteCards = true
	}: Props = $props();

	let prose = $state<HTMLElement>();

	const taskIndex = $derived(new Map(taskItems(doc).map((item, i) => [item, i])));
	const images = $derived(docImages(doc));
	const imageIndex = $derived(new Map(images.map((image, i) => [image, i])));
	/** The lightbox's images, served from where this page serves files, as the tiles are. */
	const lightboxImages = $derived(
		images.map((node) => ({
			src: fileUrl(String(node.attrs?.src)),
			alt: String(node.attrs?.alt ?? '')
		}))
	);
	/** The image open in the lightbox. */
	let shown = $state<number | null>(null);

	type Token = Highlighted['children'][number];
	const hasCode = (node: DocNode): boolean =>
		node.type === 'codeBlock' || (node.content ?? []).some(hasCode);
	/** Code highlighting, loaded only once a document with a code block is shown. */
	let highlight = $state.raw<typeof highlightCode>();
	$effect(() => {
		if (highlight || !hasCode(doc)) return;
		void import('#lib/editor/highlight.js').then((m) => (highlight = m.highlightCode));
	});

	const blockTags: Record<string, string> = {
		paragraph: 'p',
		bulletList: 'ul',
		listItem: 'li',
		blockquote: 'blockquote',
		// Closed for every reader until they open it: the document doesn't say.
		details: 'details',
		detailsSummary: 'summary',
		detailsContent: 'div'
	};
	const markTags: Record<string, string> = {
		bold: 'strong',
		italic: 'em',
		strike: 's',
		underline: 'u',
		code: 'code',
		kbd: 'kbd'
	};
	/** Marks whose text is shown as written, without tag links or emoji. */
	const literal = new Set(['code', 'kbd']);

	function unknown(kind: string, type: string): never {
		throw new Error(`RichText expected a sanitized document, got unknown ${kind} "${type}"`);
	}

	const headingTag = (level: unknown) => `h${Math.min(3, Math.max(1, Number(level) || 1))}`;

	/** The first three bare-link paragraphs, in document order; later ones stay plain links. */
	const previewed = $derived.by(() => {
		const found: DocNode[] = [];
		const walk = (node: DocNode) => {
			if (found.length === maxLinkPreviews) return;
			if (node.type === 'paragraph' && bareLink(node)) found.push(node);
			else node.content?.forEach(walk);
		};
		walk(doc);
		return new Set(found);
	});
</script>

{#snippet inline(value: string)}
	{#each inlineParts(value, { tags, emoji: customEmoji }) as part, i (i)}
		{#if part.type === 'tag'}
			<a class="tag" href={resolve('/tags/[tag]', { tag: part.tag })}>{part.value}</a>
		{:else if part.type === 'emoji'}
			<img class="emoji" src={part.url} alt={part.value} title={part.value} />
		{:else}{part.value}{/if}
	{/each}
{/snippet}

<!-- Links, code and keys keep their text as written: no tag links or emoji inside them. -->
{#snippet marked(value: string, marks: DocMark[], plain = true)}
	{#if marks.length === 0}{#if plain}{@render inline(value)}{:else}{value}{/if}{:else}
		{@const [mark, ...rest] = marks}
		{#if mark.type === 'link'}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={String(mark.attrs?.href)} rel="noopener noreferrer nofollow" target="_blank"
				>{@render marked(value, rest, false)}</a
			>
		{:else if mark.type === 'noteComment'}
			<span class="note-comment" data-comment-id={String(mark.attrs?.commentId)}
				>{@render marked(value, rest, plain)}</span
			>
		{:else}
			<svelte:element this={markTags[mark.type] ?? unknown('mark', mark.type)}
				>{@render marked(value, rest, plain && !literal.has(mark.type))}</svelte:element
			>
		{/if}
	{/if}
{/snippet}

{#snippet children(node: DocNode)}
	{#each node.content ?? [] as child, i (i)}{@render render(child)}{/each}
{/snippet}

<!-- A highlighted code block's token: an hljs-* span around more tokens, or its text. -->
{#snippet token(part: Token)}
	{#if part.type === 'element'}<span class={part.properties.className as string[]}
			>{#each part.children as child, i (i)}{@render token(child)}{/each}</span
		>{:else if part.type === 'text'}{part.value}{/if}
{/snippet}

<!-- A code block's text, plain until highlighting has loaded. -->
{#snippet highlighted(code: string, language: unknown)}
	{#if highlight}
		{#each highlight(code, language).children as part, i (i)}{@render token(part)}{/each}
	{:else}{code}{/if}
{/snippet}

{#snippet tile(node: DocNode)}
	{@const alt = String(node.attrs?.alt ?? '')}
	<button
		type="button"
		class="image"
		aria-label={text.gallery.open(alt)}
		onclick={() => (shown = imageIndex.get(node)!)}
	>
		<img src={fileUrl(String(node.attrs?.src))} {alt} loading="lazy" />
	</button>
{/snippet}

{#snippet render(node: DocNode)}
	{@const attrs = node.attrs ?? {}}
	{#if node.type === 'text'}{@render marked(node.text ?? '', node.marks ?? [])}
	{:else if node.type === 'mention'}<span class="mention">@{attrs.label}</span>
	{:else if node.type === 'relativeTime'}
		{@const at = Number(attrs.timestamp)}
		<time
			class="relative-time"
			datetime={new Date(at).toISOString()}
			title={text.relativeTime.title(at, page.data.timeZone)}
			>{text.relativeTime.phrase(at, Date.now())}</time
		>
	{:else if node.type === 'resourceMention'}
		{@const target = resources[resourceKey(attrs as ResourceRef)]}
		<ResourceChip kind={attrs.kind as ResourceKind} {target} />
	{:else if node.type === 'hardBreak'}<br />
	{:else if node.type === 'horizontalRule'}<hr />
	{:else if node.type === 'heading'}
		<svelte:element this={headingTag(attrs.level)}>{@render children(node)}</svelte:element>
	{:else if node.type === 'orderedList'}
		<ol start={Number(attrs.start ?? 1)}>{@render children(node)}</ol>
	{:else if node.type === 'codeBlock'}
		{@const code = (node.content ?? []).map((t) => t.text).join('')}
		<pre><code class={attrs.language ? `language-${attrs.language}` : undefined}
				>{@render highlighted(code, attrs.language)}</code
			></pre>
	{:else if node.type === 'paragraph' && previewed.has(node)}
		<p>{@render children(node)}</p>
		<LinkPreview href={bareLink(node)!} />
	{:else if node.type === 'image' && image}
		{@render image({ src: String(attrs.src), alt: String(attrs.alt ?? '') })}
	{:else if node.type === 'taskList'}
		<ul class="tasks">{@render children(node)}</ul>
	{:else if node.type === 'taskItem'}
		{@const done = attrs.checked === true}
		<li class="task" data-checked={done}>
			<input
				type="checkbox"
				checked={done}
				disabled={!ontick}
				aria-label={text.taskToggle(done)}
				onchange={(e) => ontick?.(taskIndex.get(node)!, e.currentTarget.checked)}
			/>
			<div>{@render children(node)}</div>
		</li>
	{:else if node.type === 'image'}{@render tile(node)}
	{:else if node.type === 'attachment'}
		<!-- A file, not a page: resolve() is for routes. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			class="attachment"
			href={fileUrl(attachmentPath(String(attrs.id)))}
			download={String(attrs.name)}
		>
			{attrs.name} <span>{text.fileSize(Number(attrs.size))}</span>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{:else}
		<svelte:element this={blockTags[node.type] ?? unknown('node', node.type)}
			>{@render children(node)}</svelte:element
		>
	{/if}
{/snippet}

<div
	class="prose"
	data-size={compact ? 'compact' : note ? 'note' : post ? 'post' : undefined}
	bind:this={prose}
>
	{#if doc.type === 'doc'}
		{#each withGalleries(doc.content ?? []) as block, i (i)}
			{#if 'images' in block}
				<div class="gallery" role="group" aria-label={text.gallery.label(block.images.length)}>
					{#each block.images as image, j (j)}{@render tile(image)}{/each}
				</div>
			{:else}{@render render(block)}{/if}
		{/each}
	{:else}{@render render(doc)}{/if}
</div>

<Lightbox images={lightboxImages} index={shown} onchange={(i) => (shown = i)} />
{#if noteCards}<NoteLinkCard root={prose} />{/if}

<style>
	/* .prose styles the rest, mentions included. */
	.attachment {
		padding-inline: var(--gap-xs);
		border-radius: var(--radius-control);
		background-color: var(--hue-z1-bg);
	}

	.attachment span {
		color: var(--hue-z1-muted);
	}

	.image {
		display: block;
		padding: 0;
		border: 0;
		background: none;
		cursor: zoom-in;
	}

	/* Images that sit together lay out by how many there are (parity.md §6.4): 4:3 tiles two to
	   a row, and three as one large beside two stacked. One frame holds the set, so only its
	   outer corners are round and the tiles meet on a thin gap. */
	.gallery {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--gap-xs);
		overflow: hidden;
		border-radius: var(--radius-surface);
	}

	.gallery > .image {
		block-size: 100%;
	}

	.gallery img {
		display: block;
		inline-size: 100%;
		block-size: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		border-radius: 0;
	}

	.gallery:has(> :last-child:nth-child(3)) {
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
	}

	.gallery:has(> :last-child:nth-child(3)) > :first-child {
		grid-row: span 2;
	}

	.gallery:has(> :last-child:nth-child(3)) > :first-child img {
		aspect-ratio: auto;
	}

	/* The frame clips anything outside it, so a tile's focus ring sits inside the tile. */
	.gallery > .image:focus-visible {
		outline-offset: calc(var(--focus-ring-width) * -1);
	}

	/* Campsite's checklist: a 20px box in blue once ticked, the done item's text struck through
	   in the faintest grey. */
	.tasks {
		padding-inline-start: 0;
		list-style: none;
	}

	.task {
		display: flex;
		gap: var(--gap-sm);
		align-items: flex-start;
	}

	.task input {
		flex: none;
		inline-size: 1.25rem;
		block-size: 1.25rem;
		margin: 0.125rem 0 0;
		accent-color: var(--hue-blue-500);
		cursor: pointer;
	}

	.task input:disabled {
		cursor: default;
	}

	.task > div {
		min-inline-size: 1em;
	}

	.task > div > :global(p) {
		margin-block: 0;
	}

	.task[data-checked='true'] > div {
		color: var(--hue-text-quaternary);
		text-decoration: line-through;
		text-decoration-thickness: 0.125rem;
	}

	/* A custom emoji sits on the line like a character. */
	.emoji {
		display: inline;
		block-size: 1.25em;
		inline-size: auto;
		vertical-align: -0.25em;
	}
</style>
