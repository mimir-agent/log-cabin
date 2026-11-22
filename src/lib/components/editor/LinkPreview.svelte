<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { LinkPreview } from '#lib/link-preview.js';
	import { editor as text } from '#lib/strings/editor.js';

	/** A link pasted on a line of its own; its card replaces nothing, so failure shows no card. */
	const { href }: { href: string } = $props();
	let preview = $state<LinkPreview | null>(null);
	let playing = $state(false);

	$effect(() => {
		const controller = new AbortController();
		fetch(`/link-preview?url=${encodeURIComponent(href)}`, { signal: controller.signal })
			.then(async (response) => {
				const body: { preview: LinkPreview | null } = response.ok
					? await response.json()
					: { preview: null };
				preview = body.preview;
			})
			// Offline, or the page closed before the answer came: the link stays a plain link.
			.catch(() => {});
		return () => controller.abort();
	});
</script>

{#if preview?.kind === 'youtube'}
	{@const title = preview.title ?? text.linkPreview.video}
	<!-- The thumbnail comes through our server, so YouTube hears nothing until someone presses play. -->
	<div class="video">
		{#if playing}
			<iframe
				src="https://www.youtube-nocookie.com/embed/{preview.videoId}?autoplay=1"
				{title}
				referrerpolicy="strict-origin-when-cross-origin"
				allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
				allowfullscreen
			></iframe>
		{:else}
			<img src="/link-preview/youtube/{preview.videoId}" alt="" loading="lazy" />
			<button
				type="button"
				aria-label={text.linkPreview.play(title)}
				onclick={() => (playing = true)}
			>
				<span class="disc"><Icon name="play" size={32} /></span>
			</button>
		{/if}
	</div>
{:else if preview?.kind === 'post'}
	<a class="card" href={resolve('/posts/[id]', { id: preview.id })}>
		<span class="text">
			<span class="title">{preview.title}</span>
			<span class="domain">{text.linkPreview.post(preview.author, preview.project)}</span>
		</span>
	</a>
{:else if preview?.kind === 'unavailable'}
	<p class="card" data-unavailable>{text.linkPreview.unavailable}</p>
{:else if preview?.kind === 'page'}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a class="card" href={preview.url} rel="noopener noreferrer nofollow" target="_blank">
		{#if preview.image}<img src={preview.image} alt="" loading="lazy" />{/if}
		<span class="text">
			<span class="title">{preview.title}</span>
			{#if preview.description}<span class="description">{preview.description}</span>{/if}
			<span class="domain">{preview.domain}</span>
		</span>
	</a>
{/if}

<style>
	.video {
		position: relative;
		max-inline-size: 32rem;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		border-radius: var(--radius-surface);
		background-color: var(--hue-media-bg);
	}

	/* Each layer fills the 16:9 box: a 4:3 thumbnail is cropped, not stretched or overflowing. */
	.video > * {
		position: absolute;
		inset: 0;
		inline-size: 100%;
		block-size: 100%;
	}

	.video img {
		object-fit: cover;
	}

	iframe {
		border: 0;
	}

	.video button {
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.disc {
		display: grid;
		place-items: center;
		inline-size: 3.5rem;
		block-size: 3.5rem;
		border-radius: 50%;
		background-color: color-mix(in oklch, var(--hue-black) 60%, transparent);
		color: var(--hue-white);
		transition: background-color var(--motion-fast);
	}

	.video button:hover .disc {
		background-color: color-mix(in oklch, var(--hue-black) 80%, transparent);
	}

	.card {
		display: flex;
		gap: var(--gap-md);
		max-inline-size: 32rem;
		padding: var(--gap-sm);
		border: var(--border-w-hairline) solid var(--hue-z1-border);
		border-radius: var(--radius-surface);
		background-color: var(--hue-z1-bg);
		color: var(--hue-z1-fg);
		text-decoration: none;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	/* The preview is fetched after the page draws: it fades in where it lands instead of
	   popping into the post. */
	.card,
	.video {
		animation: arrive var(--motion-base) var(--motion-ease-out);
	}

	@keyframes arrive {
		from {
			opacity: 0;
		}
	}

	.card:hover {
		background-color: var(--hue-hover);
	}

	.card img {
		flex: none;
		inline-size: 5rem;
		block-size: 5rem;
		object-fit: cover;
		border-radius: var(--radius-control);
	}

	.text {
		display: grid;
		gap: var(--gap-xs);
		align-content: start;
		min-inline-size: 0;
		font-size: var(--type-body);
		line-height: var(--leading-tight);
	}

	.title {
		display: -webkit-box;
		overflow: hidden;
		font-weight: var(--fw-medium);
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.description {
		overflow: hidden;
		color: var(--hue-z1-muted);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.domain {
		color: var(--hue-z1-muted);
		font-size: var(--type-caption);
	}

	.card[data-unavailable] {
		margin: 0;
		color: var(--hue-z1-muted);
		font-size: var(--type-body);
	}
</style>
