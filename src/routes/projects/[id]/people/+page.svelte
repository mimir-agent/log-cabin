<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import ListRow from '#lib/components/shell/ListRow.svelte';
	import PageColumns from '#lib/components/shell/PageColumns.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = posts.projects;
</script>

<svelte:head>
	<title>{s.people} · {data.project.name} · {core.appName}</title>
</svelte:head>

<PageHeader title={s.people}>
	{#snippet description()}
		<a href={resolve('/projects/[id]', { id: data.project.id })}>{data.project.name}</a>
	{/snippet}
</PageHeader>
<PageColumns>
	{#if data.people.length === 0}
		<EmptyState title={s.noPeople} />
	{:else}
		<ul class="list" role="list">
			{#each data.people as person (person.id)}
				<li>
					<ListRow>
						{#snippet leading()}<Avatar name={person.name} />{/snippet}
						{#snippet description()}{core.roles[person.role]}{/snippet}
						{#snippet meta()}
							{#if data.canManage || person.id === data.me}
								<form method="POST" action="?/remove" use:enhance>
									<input type="hidden" name="userId" value={person.id} />
									<button class="quiet">{s.removePerson(person.name)}</button>
								</form>
							{/if}
						{/snippet}
						{person.name}
					</ListRow>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.candidates.length > 0}
		<form method="POST" action="?/add" class="add" use:enhance>
			<label>
				<span>{s.addPerson}</span>
				<select name="userId" required>
					{#each data.candidates as person (person.id)}
						<option value={person.id}>{person.name} · {core.roles[person.role]}</option>
					{/each}
				</select>
			</label>
			<SuedeButton type="submit">{s.addPersonSubmit}</SuedeButton>
		</form>
	{/if}
</PageColumns>

<style>
	a {
		color: inherit;
	}

	.list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.list > li {
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
	}

	.quiet {
		block-size: var(--control-h-sm);
		padding-inline: var(--gap-sm);
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--hue-z0-muted);
		font: inherit;
		font-size: var(--type-body);
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	.quiet:hover {
		background-color: var(--hue-hover);
		color: var(--hue-z0-fg);
	}

	.add {
		display: flex;
		gap: var(--gap-sm);
		align-items: end;
		padding: var(--gap-xl) var(--gap-lg);
	}

	label {
		display: grid;
		gap: var(--gap-xs);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}

	select {
		min-block-size: var(--control-h-md);
		padding-inline: var(--gap-sm);
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-control);
		background-color: var(--hue-z0-bg);
		color: var(--hue-z0-fg);
		font: inherit;
		font-size: var(--type-control);
	}
</style>
