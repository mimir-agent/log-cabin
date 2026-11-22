<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Badge from '#lib/components/shell/Badge.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import ListRow from '#lib/components/shell/ListRow.svelte';
	import PageColumns from '#lib/components/shell/PageColumns.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { core } from '#lib/strings/core.js';
	import { chat } from '#lib/strings/chat.js';
	import { posts } from '#lib/strings/posts.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = posts.projects;
	const title = $derived(data.archived ? s.archivedTitle : s.title);
</script>

<svelte:head>
	<title>{title} · {core.appName}</title>
</svelte:head>

<PageHeader {title}>
	{#snippet actions()}
		{#if data.archived}
			<a class="quiet" href={resolve('/projects')}>{s.showOpen}</a>
		{:else}
			<a class="quiet" href={resolve('/projects?archived=1')}>{s.showArchived}</a>
		{/if}
	{/snippet}
</PageHeader>
<PageColumns>
	{#if data.projects.length === 0}
		<EmptyState title={s.empty} size="index">
			{#snippet icon()}<Icon name="project" size={32} />{/snippet}
		</EmptyState>
	{:else}
		<ul class="list" role="list">
			{#each data.projects as project (project.id)}
				<li>
					<ListRow href={resolve('/projects/[id]', { id: project.id })}>
						{#snippet leading()}<Avatar
								name={project.name}
								accessory={project.accessory}
								shape="square"
							/>{/snippet}
						{#snippet description()}{project.description}{/snippet}
						{#snippet meta()}
							{#if project.private}<Badge>{s.privateBadge}</Badge>{/if}
							{#if project.isMember}<Badge>{s.joinedBadge}</Badge>{/if}
						{/snippet}
						{project.name}
					</ListRow>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.canCreate && !data.archived}
		<form id="new-project" method="POST" action="?/create" class="create" use:enhance>
			<h2 class="u:type-title">{s.create}</h2>
			{#if form?.message}
				<p role="alert">{form.message}</p>
			{/if}
			<label class="field">
				<span>{s.name}</span>
				<input name="name" required maxlength="80" value={form?.name ?? ''} />
			</label>
			<label class="field">
				<span>{s.description}</span>
				<textarea name="description" rows="3" value={form?.description ?? ''}></textarea>
			</label>
			<label class="check">
				<input type="checkbox" name="private" checked={form?.private ?? false} />
				<span>{s.private}</span>
			</label>
			<label class="check">
				<input type="checkbox" name="chat" checked={form?.chat ?? false} />
				<span>{chat.channel.option}</span>
			</label>
			<div>
				<SuedeButton type="submit">{s.submitCreate}</SuedeButton>
			</div>
		</form>
	{/if}
</PageColumns>

<style>
	.quiet {
		display: inline-flex;
		align-items: center;
		block-size: var(--control-h-sm);
		padding-inline: var(--gap-sm);
		border-radius: var(--radius-control);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		text-decoration: none;
	}

	.quiet:hover {
		background-color: var(--hue-hover);
		color: var(--hue-z0-fg);
	}

	.list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.list > li {
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
	}

	.create {
		display: grid;
		gap: var(--gap-md);
		max-inline-size: var(--measure);
		padding: var(--gap-xl) var(--gap-lg);
		font-size: var(--type-body);
	}

	.create h2,
	.create p {
		margin: 0;
	}

	.field {
		display: grid;
		gap: var(--gap-xs);
	}

	.field > span {
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}

	.field input,
	.field textarea {
		min-block-size: var(--control-h-md);
		padding: var(--gap-xs) var(--gap-sm);
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-control);
		background-color: var(--hue-z0-bg);
		color: inherit;
		font: inherit;
		font-size: var(--type-control);
	}

	.check {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
	}
</style>
