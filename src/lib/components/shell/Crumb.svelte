<!--
@component
The breadcrumb before a detail page's title, after Campsite's BreadcrumbTitlebar: a small mark,
the parent page as a link, and a faint slash; the title that follows is the page's own. Only
from 1024px; on smaller screens the header's back arrow does its job.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { posts } from '#lib/strings/posts.js';

	type Props = { href: string; label: string; mark?: Snippet };

	const { href, label, mark }: Props = $props();
</script>

<nav class="crumb" aria-label={posts.post.breadcrumb}>
	{#if mark}<span class="mark" aria-hidden="true">{@render mark()}</span>{/if}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass a resolved href -->
	<a {href}>{label}</a>
	<span class="sep" aria-hidden="true">{posts.post.crumbSeparator}</span>
</nav>

<style>
	.crumb {
		display: flex;
		flex: none;
		gap: 0.375rem;
		align-items: center;
		max-inline-size: 32ch;
		/* The header puts 12px before the title; the separator wants 6px on both sides. */
		margin-inline-end: calc(0.375rem - var(--gap-md));
		font-size: 0.9375rem;
		font-weight: var(--fw-medium);
		white-space: nowrap;
	}

	.mark {
		display: flex;
		flex: none;
	}

	a {
		overflow: hidden;
		color: inherit;
		text-decoration: none;
		text-overflow: ellipsis;
	}

	a:hover {
		text-decoration: underline;
	}

	.sep {
		color: var(--hue-text-quaternary);
		font-size: var(--type-body);
		font-weight: var(--fw-regular);
	}

	@media (max-width: 63.99rem) {
		.crumb {
			display: none;
		}
	}
</style>
