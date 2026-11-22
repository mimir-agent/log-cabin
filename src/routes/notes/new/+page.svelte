<script lang="ts">
	import { resolve } from '$app/paths';
	import NoteForm from '#lib/components/notes/NoteForm.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import PageIcon from '#lib/components/shell/PageIcon.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { core } from '#lib/strings/core.js';
	import { notes } from '#lib/strings/notes.js';
	import { posts } from '#lib/strings/posts.js';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();
	const s = notes.editor;
</script>

<svelte:head>
	<title>{s.newTitle} · {core.appName}</title>
</svelte:head>

<!-- Laid out as the note it becomes: the same breadcrumb, column and bare title and body. The
     titlebar holds Cancel and Create, since an unsaved note has nothing else to show there. -->
<PageHeader title={s.newTitle} back={resolve('/notes')}>
	{#snippet leading()}
		<nav class="crumb" aria-label={posts.post.breadcrumb}>
			<PageIcon tone="note" />
			{#if data.project}
				<a href={resolve('/projects/[id]', { id: data.project.id })}>{data.project.name}</a>
			{:else}
				<a href={resolve('/notes')}>{notes.list.title}</a>
			{/if}
			<span class="crumb-sep" aria-hidden="true">{posts.post.crumbSeparator}</span>
		</nav>
	{/snippet}
	{#snippet actions()}
		<span class="cancel"><Button href={resolve('/notes')} variant="ghost">{s.cancel}</Button></span>
		<Button type="submit" form="new-note" variant="primary">{s.create}</Button>
	{/snippet}
</PageHeader>

<div class="doc">
	<NoteForm
		id="new-note"
		title={form?.title ?? ''}
		body={null}
		people={data.people}
		message={form?.message}
		projectId={data.project?.id}
	/>
</div>

<style>
	/* The saved note's column: 44rem, the top padding growing with the viewport. */
	.doc {
		inline-size: 100%;
		max-inline-size: calc(44rem + 2 * var(--gap-lg));
		margin-inline: auto;
		padding: 1.25rem var(--gap-lg) var(--gap-3xl);
	}

	@media (min-width: 48rem) {
		.doc {
			padding-block-start: 2.5rem;
		}
	}

	@media (min-width: 64rem) {
		.doc {
			padding-block-start: 3rem;
		}
	}

	@media (min-width: 80rem) {
		.doc {
			padding-block-start: 4rem;
		}
	}

	@media (min-width: 96rem) {
		.doc {
			padding-block-start: 5rem;
		}
	}

	.crumb {
		display: flex;
		flex: none;
		gap: 0.375rem;
		align-items: center;
		/* The header puts 12px before the title; the separator wants 6px on both sides. */
		margin-inline-end: calc(0.375rem - var(--gap-md));
		font-size: 0.9375rem;
		font-weight: var(--fw-medium);
		white-space: nowrap;
	}

	.crumb a {
		color: inherit;
		text-decoration: none;
	}

	.crumb a:hover {
		text-decoration: underline;
	}

	.crumb-sep {
		color: var(--hue-text-quaternary);
		font-size: var(--type-body);
		font-weight: var(--fw-regular);
	}

	/* Phones have the back arrow, which does what Cancel does. */
	@media (max-width: 63.99rem) {
		.crumb,
		.cancel {
			display: none;
		}
	}
</style>
