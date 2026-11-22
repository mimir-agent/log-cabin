<script lang="ts">
	import { enhance } from '$app/forms';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';

	type Bookmark = { id: string; title: string; url: string };
	type Props = { bookmarks: Bookmark[]; canWrite: boolean; error?: string; editError?: string };

	const { bookmarks, canWrite, error, editError }: Props = $props();
	const s = posts.bookmarks;
	const edit = posts.channelSettings;
	let adding = $state(false);
	let editing = $state<Bookmark | null>(null);
</script>

{#snippet move(bookmark: Bookmark, direction: 'up' | 'down', label: string)}
	<form method="POST" action="?/moveBookmark" use:enhance>
		<input type="hidden" name="bookmarkId" value={bookmark.id} />
		<input type="hidden" name="direction" value={direction} />
		<IconButton type="submit" icon={direction === 'up' ? 'arrow-up' : 'arrow-down'} {label} quiet />
	</form>
{/snippet}

<!-- The project's links in a bordered list, as its pins above; members reorder them in place. -->
<section aria-labelledby="bookmarks-title">
	<h2 id="bookmarks-title" class="heading">{s.title}</h2>
	{#if bookmarks.length}
		<ol class="list" role="list">
			{#each bookmarks as bookmark, i (bookmark.id)}
				<li class="row">
					<span class="mark"><Icon name="link" /></span>
					<!-- eslint-disable svelte/no-navigation-without-resolve -- an outside link -->
					<a
						class="link"
						href={bookmark.url}
						rel="noopener noreferrer"
						target="_blank"
						title={bookmark.url}
					>
						{bookmark.title}
						<span class="host">{new URL(bookmark.url).host}</span>
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{#if canWrite}
						{#if i > 0}{@render move(bookmark, 'up', s.moveUp(bookmark.title))}{/if}
						{#if i < bookmarks.length - 1}
							{@render move(bookmark, 'down', s.moveDown(bookmark.title))}
						{/if}
						<IconButton
							icon="pencil"
							label={edit.bookmarkEdit}
							quiet
							onclick={() => (editing = bookmark)}
						/>
						<form method="POST" action="?/removeBookmark" use:enhance>
							<input type="hidden" name="bookmarkId" value={bookmark.id} />
							<IconButton type="submit" icon="trash" label={s.remove(bookmark.title)} quiet />
						</form>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
	{#if canWrite}
		{#if adding || error}
			<form
				class="add"
				method="POST"
				action="?/addBookmark"
				use:enhance={() =>
					({ result, update }) => {
						if (result.type === 'success') adding = false;
						return update();
					}}
			>
				<label>
					<span>{s.titleLabel}</span>
					<input name="title" required maxlength="255" />
				</label>
				<label>
					<span>{s.urlLabel}</span>
					<input name="url" type="url" required placeholder={s.urlPlaceholder} />
				</label>
				<Button type="submit" variant="primary">{s.submit}</Button>
				{#if error}<p class="error" role="alert">{error}</p>{/if}
			</form>
		{:else}
			<Button variant="ghost" onclick={() => (adding = true)}>
				<Icon name="plus" />
				{s.add}
			</Button>
		{/if}
	{/if}
</section>

<Dialog
	open={!!editing}
	title={edit.bookmarkEditTitle}
	onOpenChange={(open) => {
		if (!open) editing = null;
	}}
>
	{#if editing}
		<form
			id="edit-bookmark"
			method="POST"
			action="?/editBookmark"
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') editing = null;
				}}
		>
			<input type="hidden" name="bookmarkId" value={editing.id} />
			<SettingsField label={edit.bookmarkTitleLabel} error={editError}>
				{#snippet children({ id, hintId })}
					<input
						{id}
						name="title"
						value={editing?.title}
						required
						maxlength="255"
						aria-describedby={hintId}
					/>
				{/snippet}
			</SettingsField>
			<SettingsField label={edit.bookmarkUrlLabel}>
				{#snippet children({ id })}
					<input {id} name="url" type="url" value={editing?.url} required />
				{/snippet}
			</SettingsField>
		</form>
	{/if}
	{#snippet actions()}
		<Button onclick={() => (editing = null)}>{core.actions.close}</Button>
		<Button type="submit" form="edit-bookmark" variant="primary">{edit.bookmarkSave}</Button>
	{/snippet}
</Dialog>

<style>
	#edit-bookmark {
		display: flex;
		flex-direction: column;
		gap: var(--gap-md);
	}

	.heading {
		margin: 0 0 var(--gap-sm);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
	}

	.list {
		margin: 0 0 var(--gap-sm);
		padding: 0;
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-surface);
		list-style: none;
	}

	.row {
		display: flex;
		gap: var(--gap-xs);
		align-items: center;
		min-block-size: var(--control-h-lg);
		padding-inline: var(--gap-md) var(--gap-xs);
	}

	.row + .row {
		border-block-start: var(--border-w-hairline) solid var(--hue-border-secondary);
	}

	.mark {
		display: flex;
		flex: none;
		margin-inline-end: var(--gap-xs);
		color: var(--hue-z0-muted);
	}

	.link {
		flex: 1;
		overflow: hidden;
		color: var(--hue-z0-fg);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.link:hover {
		text-decoration: underline;
	}

	.host {
		margin-inline-start: var(--gap-xs);
		color: var(--hue-z0-muted);
		font-weight: var(--fw-regular);
	}

	.add {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
		align-items: end;
	}

	.add label {
		display: grid;
		flex: 1;
		gap: var(--gap-xs);
		min-inline-size: 10rem;
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}

	.error {
		flex-basis: 100%;
		margin: 0;
		color: var(--hue-danger);
		font-size: var(--type-body);
	}
</style>
