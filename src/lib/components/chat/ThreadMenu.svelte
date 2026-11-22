<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Thread/ChatThreadOverflowMenu.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
A thread's "…" menu and the dialogs it opens, after Campsite's ChatThreadOverflowMenu and
its dialogs (apps/web/components/Thread/, CC BY-NC 4.0): favorite, mark unread or read
(also mod+U), notification settings, the group's name and picture, its people, leaving, and
deleting the whole thread.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { DropdownMenu } from 'bits-ui';
	import CroppingImageInput from '#lib/components/images/CroppingImageInput.svelte';
	import SettingsField from '#lib/components/settings/SettingsField.svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';
	import { setFavorite } from '#lib/favorites.js';
	import { failureText, postAction } from '#lib/forms/submit.js';
	import { chat } from '#lib/strings/chat.js';
	import { shell } from '#lib/strings/shell.js';
	import PeoplePicker from './PeoplePicker.svelte';

	type Level = 'all' | 'mentions' | 'none';
	type Props = {
		thread: {
			id: string;
			kind: 'dm' | 'group' | 'channel';
			title: string | null;
			favorite: boolean;
			notificationLevel: Level;
			pictureUrl: string | null;
			people: { id: string; name: string; deactivated: boolean }[];
		};
		viewerId: string;
		/** People "Add people" offers: those this member may chat with who aren't here. */
		addable: { id: string; name: string }[];
		canDelete: boolean;
		/** Why the last name or picture was refused. */
		editError?: string;
	};

	let { thread, viewerId, addable, canDelete, editError }: Props = $props();
	const s = chat;

	// The page marks the thread read as it opens, so it starts read here.
	let unread = $state(false);
	let editing = $state(false);
	let managing = $state(false);
	let leaving = $state(false);
	let deleting = $state(false);
	let picturePreview = $state<string | null>(null);
	let removePicture = $state(false);
	let pictureInput: CroppingImageInput | undefined = $state();
	const picture = $derived(removePicture ? null : (picturePreview ?? thread.pictureUrl));

	/** Posts one of the thread page's actions; a refusal says why in a toast. */
	async function act(action: string, fields: Record<string, string>) {
		const data = new FormData();
		for (const [name, value] of Object.entries(fields)) data.set(name, value);
		const result = await postAction(`?/${action}`, data);
		if (result.type === 'failure' || result.type === 'error') {
			toast(failureText(result));
			return false;
		}
		return true;
	}

	async function toggleUnread() {
		const next = !unread;
		unread = next;
		// Only the list beside the thread reloads: reloading the open thread would mark it read.
		if (!(await act('unread', { unread: String(next) }))) unread = !next;
		await invalidate('chat:threads');
	}

	async function toggleFavorite() {
		await setFavorite({ type: 'thread', id: thread.id }, !thread.favorite);
	}

	let choosingLevel = $state(false);
	const levels = [
		{ value: 'all', name: s.levels.all, hint: s.levels.allHint },
		{ value: 'mentions', name: s.levels.mentions, hint: s.levels.mentionsHint },
		{ value: 'none', name: s.levels.none, hint: s.levels.noneHint }
	] as const;

	function onkeydown(event: KeyboardEvent) {
		if (event.key.toLowerCase() !== 'u' || !(event.metaKey || event.ctrlKey) || event.altKey) {
			return;
		}
		event.preventDefault();
		toggleUnread();
	}

	const modKey = () =>
		/Mac|iPhone|iPad/.test(navigator.userAgent)
			? shell.shortcuts.modKey.apple
			: shell.shortcuts.modKey.other;
</script>

<svelte:window {onkeydown} />

<Menu align="end" minWidth="15rem">
	{#snippet trigger({ props })}
		<IconButton {...props} icon="dots-horizontal" label={s.menu.label} />
	{/snippet}
	<DropdownMenu.Item onSelect={toggleFavorite}>
		<Icon name={thread.favorite ? 'star-filled' : 'star-outline'} />
		{thread.favorite ? s.menu.unfavorite : s.menu.favorite}
	</DropdownMenu.Item>
	<DropdownMenu.Item onSelect={toggleUnread}>
		<Icon name={unread ? 'check-square' : 'unread-square-badge'} />
		{unread ? s.menu.markRead : s.menu.markUnread}
		<kbd data-menu-shortcut>{modKey()} U</kbd>
	</DropdownMenu.Item>
	<DropdownMenu.Item onSelect={() => (choosingLevel = true)}>
		<Icon name="bell" />
		{s.menu.notifications}
	</DropdownMenu.Item>
	{#if thread.kind !== 'channel'}
		<DropdownMenu.Separator />
		{#if thread.kind === 'group'}
			<DropdownMenu.Item onSelect={() => (editing = true)}>
				<Icon name="photo" />
				{s.menu.edit}
			</DropdownMenu.Item>
		{/if}
		<DropdownMenu.Item onSelect={() => (managing = true)}>
			<Icon name="user-circle-plus" />
			{thread.kind === 'group' ? s.menu.people : s.people.add}
		</DropdownMenu.Item>
		{#if thread.kind === 'group'}
			<DropdownMenu.Separator />
			<DropdownMenu.Item data-tone="danger" onSelect={() => (leaving = true)}>
				<Icon name="log-out" />
				{s.menu.leave}
			</DropdownMenu.Item>
		{/if}
	{/if}
	{#if canDelete}
		<DropdownMenu.Separator />
		<DropdownMenu.Item data-tone="danger" onSelect={() => (deleting = true)}>
			<Icon name="trash" />
			{s.menu.delete}
		</DropdownMenu.Item>
	{/if}
</Menu>

<Dialog
	bind:open={choosingLevel}
	title={s.levels.title}
	description={s.levels.description}
	size="sm"
>
	<form
		id="notification-level"
		method="POST"
		action="?/level"
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') choosingLevel = false;
			}}
	>
		<fieldset class="levels">
			<legend class="u:visually-hidden">{s.levels.title}</legend>
			{#each levels as level (level.value)}
				<label class="level">
					<input
						type="radio"
						name="level"
						value={level.value}
						checked={thread.notificationLevel === level.value}
					/>
					<span>
						<span class="level-name">{level.name}</span>
						<span class="level-hint">{level.hint}</span>
					</span>
				</label>
			{/each}
		</fieldset>
	</form>
	{#snippet actions()}
		<Button onclick={() => (choosingLevel = false)}>{s.thread.cancel}</Button>
		<Button type="submit" form="notification-level" variant="primary">{s.levels.save}</Button>
	{/snippet}
</Dialog>

{#if thread.kind === 'group'}
	<Dialog bind:open={editing} title={s.editGroup.title}>
		<form
			id="edit-group"
			class="fields"
			method="POST"
			action="?/editGroup"
			enctype="multipart/form-data"
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						editing = false;
						picturePreview = null;
						removePicture = false;
					}
				}}
		>
			<div class="picture">
				<Avatar name={thread.title || '·'} src={picture} size="xl" />
				<CroppingImageInput
					bind:this={pictureInput}
					name="picture"
					shape="avatar"
					label={s.editGroup.choosePicture}
					onpreview={(url) => {
						picturePreview = url;
						removePicture = false;
					}}
				/>
				<Button size="sm" onclick={() => pictureInput?.pick()}>{s.editGroup.choosePicture}</Button>
				{#if picture}
					<Button size="sm" variant="ghost" onclick={() => (removePicture = true)}>
						{s.editGroup.removePicture}
					</Button>
				{/if}
				{#if removePicture}<input type="hidden" name="removePicture" value="true" />{/if}
			</div>
			<SettingsField label={s.editGroup.name} hint={s.editGroup.nameHint} error={editError}>
				{#snippet children({ id, hintId })}
					<input
						{id}
						name="title"
						value={thread.title ?? ''}
						maxlength="100"
						placeholder={s.editGroup.namePlaceholder}
						aria-describedby={hintId}
					/>
				{/snippet}
			</SettingsField>
		</form>
		{#snippet actions()}
			<Button onclick={() => (editing = false)}>{s.thread.cancel}</Button>
			<Button type="submit" form="edit-group" variant="primary">{s.editGroup.save}</Button>
		{/snippet}
	</Dialog>

	<Dialog bind:open={leaving} title={s.leave.title} description={s.leave.description} size="sm">
		{#snippet actions()}
			<Button onclick={() => (leaving = false)}>{s.thread.cancel}</Button>
			<form method="POST" action="?/leave" use:enhance>
				<Button type="submit" variant="danger">{s.leave.confirm}</Button>
			</form>
		{/snippet}
	</Dialog>
{/if}

{#if thread.kind !== 'channel'}
	<Dialog bind:open={managing} title={thread.kind === 'group' ? s.people.title : s.people.add}>
		<div class="fields">
			{#if thread.kind === 'group'}
				<ul role="list" class="members">
					{#each thread.people as person (person.id)}
						<li class="member">
							<Avatar name={person.name} size="sm" />
							<span class="name">{person.id === viewerId ? s.people.you : person.name}</span>
							{#if person.id !== viewerId}
								<form method="POST" action="?/removePerson" use:enhance>
									<input type="hidden" name="userId" value={person.id} />
									<IconButton
										type="submit"
										icon="minus-circle"
										label={s.people.remove(person.name)}
										quiet
									/>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="note">{s.people.dmNote}</p>
			{/if}
			{#if addable.length}
				<form
					id="add-people"
					method="POST"
					action="?/addPeople"
					use:enhance={() =>
						async ({ result, update }) => {
							await update();
							if (result.type === 'success' || result.type === 'redirect') managing = false;
						}}
				>
					<fieldset>
						<legend class="heading">{s.people.add}</legend>
						<PeoplePicker people={addable} choose="many" />
					</fieldset>
				</form>
			{:else}
				<p class="note">{s.people.nobodyToAdd}</p>
			{/if}
		</div>
		{#snippet actions()}
			<Button onclick={() => (managing = false)}>{s.thread.cancel}</Button>
			{#if addable.length}
				<Button type="submit" form="add-people" variant="primary">{s.people.addSubmit}</Button>
			{/if}
		{/snippet}
	</Dialog>
{/if}

{#if canDelete}
	<Dialog
		bind:open={deleting}
		title={s.deleteThread.title}
		description={s.deleteThread.description}
		size="sm"
	>
		{#snippet actions()}
			<Button onclick={() => (deleting = false)}>{s.thread.cancel}</Button>
			<form
				method="POST"
				action="?/deleteThread"
				use:enhance={() =>
					async ({ result, update }) => {
						await update();
						if (result.type === 'redirect') toast(s.deleteThread.done);
					}}
			>
				<Button type="submit" variant="danger">{s.deleteThread.confirm}</Button>
			</form>
		{/snippet}
	</Dialog>
{/if}

<style>
	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--gap-lg);
	}

	.picture {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
	}

	.members {
		display: grid;
		gap: 0.125rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.member {
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		min-block-size: var(--control-h-lg);
		padding-inline: var(--gap-sm);
	}

	.name {
		flex: 1;
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	form {
		margin: 0;
	}

	fieldset {
		min-inline-size: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.heading {
		margin-block-end: var(--gap-xs);
		padding: 0 var(--gap-sm);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
	}

	.note {
		margin: 0;
		color: var(--hue-z0-muted);
	}

	.levels {
		display: grid;
		gap: var(--gap-md);
	}

	.level {
		display: flex;
		gap: var(--gap-sm);
		align-items: baseline;
		accent-color: var(--hue-accent);
	}

	.level-name {
		display: block;
		font-weight: var(--fw-medium);
	}

	.level-hint {
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}
</style>
