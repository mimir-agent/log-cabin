<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import TagNameDialog from '#lib/components/posts/TagNameDialog.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import ListRow from '#lib/components/shell/ListRow.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = posts.tags;

	let creating = $state(false);
	let renaming = $state(false);
	let renamingTag = $state('');
	let deleting = $state<{ name: string; postCount: number } | null>(null);
	// The dialog that is open shows the refusal; the others never see it.
	const error = (open: boolean) => (open ? form?.message : undefined);
</script>

<svelte:head>
	<title>{s.indexTitle} · {core.appName}</title>
</svelte:head>

<PageHeader title={s.indexTitle}>
	{#snippet actions()}
		<Button variant="primary" onclick={() => (creating = true)}>{s.create}</Button>
	{/snippet}
</PageHeader>

{#if data.tags.length === 0}
	<EmptyState title={s.empty} />
{:else}
	<ul class="tags">
		{#each data.tags as tag (tag.id)}
			<li>
				<ListRow href={resolve('/tags/[tag]', { tag: tag.name })}>
					#{tag.name}
					{#snippet meta()}{s.count(tag.postCount)}{/snippet}
				</ListRow>
				<IconButton
					icon="pencil"
					label={s.rename}
					quiet
					onclick={() => ((renamingTag = tag.name), (renaming = true))}
				/>
				<IconButton icon="trash" label={s.delete} quiet onclick={() => (deleting = tag)} />
			</li>
		{/each}
	</ul>
{/if}

<TagNameDialog
	bind:open={creating}
	title={s.createTitle}
	submit={s.createSubmit}
	action="?/create"
	error={error(creating)}
/>
<TagNameDialog
	bind:open={renaming}
	title={s.renameTitle}
	submit={s.renameSave}
	action="?/rename"
	from={renamingTag}
	error={error(renaming)}
/>
<Dialog
	open={deleting !== null}
	onOpenChange={(open) => !open && (deleting = null)}
	title={s.deleteTitle}
	description={deleting?.postCount ? s.deleteConfirm(deleting.postCount) : s.deleteConfirmEmpty}
	size="sm"
>
	<form
		id="delete-tag"
		method="POST"
		action="?/delete"
		use:enhance={() =>
			async ({ result, update }) => {
				await update();
				if (result.type === 'success') deleting = null;
			}}
	>
		<input type="hidden" name="name" value={deleting?.name ?? ''} />
	</form>
	{#snippet actions()}
		<Button onclick={() => (deleting = null)}>{s.cancel}</Button>
		<Button type="submit" form="delete-tag" variant="primary">{s.delete}</Button>
	{/snippet}
</Dialog>

<style>
	.tags {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
	}

	li :global(.row) {
		flex: 1;
	}
</style>
