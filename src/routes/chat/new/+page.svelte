<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import PeoplePicker from '#lib/components/chat/PeoplePicker.svelte';
	import FirstMessage from '#lib/components/chat/FirstMessage.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { core } from '#lib/strings/core.js';
	import { chat } from '#lib/strings/chat.js';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();
	const s = chat.start;
	// Campsite's picker has two steps: people to message, and a group. A link moves between
	// them, so both work without JavaScript.
	const groupStep = $derived(page.url.searchParams.has('group'));
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<PageHeader title={s.title} back={resolve('/chat')} />

<!-- After Campsite's New chat dialog (CreateChatThreadDialog): a 512px column of 40px rows, a
     face and a name each. Picking a person opens the conversation; the row above the list
     switches to starting a group. -->
<div class="picker">
	{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}

	{#if data.people.length === 0}
		<EmptyState title={s.nobody} />
	{:else if !groupStep}
		<a class="row step" href="{resolve('/chat/new')}?group">
			<span class="badge" aria-hidden="true"><Icon name="plus" size={16} strokeWidth="2" /></span>
			<span class="label">{chat.list.newGroup}</span>
			<span class="chevron" aria-hidden="true"><Icon name="chevron-right" /></span>
		</a>
		<form method="POST" action="?/dm" use:enhance>
			<h2 class="heading">{s.dmHeading}</h2>
			<PeoplePicker people={data.people} choose="one" />
		</form>
	{:else}
		<a class="row back" href={resolve('/chat/new')}>
			<span class="chevron" aria-hidden="true"><Icon name="chevron-left" /></span>
			<span class="label">{s.dmHeading}</span>
		</a>
		<form method="POST" action="?/group" class="group" enctype="multipart/form-data" use:enhance>
			<h2 class="heading">{s.groupHeading}</h2>
			<input
				class="name"
				name="title"
				maxlength="100"
				aria-label={s.groupName}
				placeholder={s.groupNamePlaceholder}
			/>
			<fieldset>
				<legend class="heading">{s.groupPeople}</legend>
				<PeoplePicker people={data.people} choose="many" />
			</fieldset>
			<!-- Campsite's create step takes the first message and its files too. -->
			<FirstMessage members={data.people} />
			<div class="submit"><SuedeButton type="submit">{s.groupSubmit}</SuedeButton></div>
		</form>
	{/if}
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		inline-size: 100%;
		max-inline-size: 32rem;
		margin-inline: auto;
		padding: var(--gap-lg) var(--gap-sm) var(--gap-2xl);
	}

	form {
		margin: 0;
	}

	/* Campsite's command rows: 40px, 8px radius, 8px in, 12px between face and name. */
	.row {
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		inline-size: 100%;
		min-block-size: var(--control-h-lg);
		padding: 0 var(--gap-sm);
		border: 0;
		border-radius: var(--radius-surface);
		background: none;
		color: var(--hue-z0-fg);
		font: inherit;
		font-size: 0.9375rem;
		text-align: start;
		text-decoration: none;
		cursor: pointer;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	.row:hover,
	.row:focus-visible,
	.row:has(:focus-visible) {
		background-color: var(--hue-hover);
	}

	.label {
		flex: 1;
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chevron {
		display: inline-flex;
		color: var(--hue-text-quaternary);
	}

	/* The way into a group is the page's one bit of colour, as in Campsite: blue text and a
	   pale blue badge that fills in when the row is hovered or focused. */
	.step {
		color: var(--hue-accent-subtle-fg);
	}

	.badge {
		display: grid;
		place-items: center;
		inline-size: 1.5rem;
		block-size: 1.5rem;
		border-radius: var(--radius-full);
		background-color: var(--hue-accent-subtle);
		transition:
			background-color var(--motion-fast) var(--motion-ease),
			color var(--motion-fast) var(--motion-ease);
	}

	.step:hover .badge,
	.step:focus-visible .badge {
		background-color: var(--hue-unread);
		color: var(--hue-unread-fg);
	}

	.back {
		color: var(--hue-text-secondary);
	}

	.heading {
		margin: var(--gap-md) 0 var(--gap-xs);
		padding: 0 var(--gap-sm);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
		line-height: 1rem;
	}

	.group {
		display: flex;
		flex-direction: column;
	}

	fieldset {
		min-inline-size: 0;
		margin: var(--gap-md) 0 0;
		padding: 0;
		border: 0;
	}

	/* A legend ignores its top margin, so the fieldset carries the space above it. */
	legend.heading {
		margin-block-start: 0;
	}

	/* Campsite's group name: a borderless 15px field over a hairline, read like a title. */
	.name {
		min-block-size: var(--control-h-lg);
		padding: 0 var(--gap-sm);
		border: 0;
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: 0;
		background: none;
		color: var(--hue-z0-fg);
		font: inherit;
		/* 15px, or 16px where a smaller field would make iOS zoom in. */
		font-size: max(0.9375rem, var(--type-control));
	}

	.name::placeholder {
		color: var(--hue-z0-muted);
	}

	.name:focus-visible {
		outline: none;
		border-block-end-color: var(--hue-z0-fg);
	}

	.submit {
		display: flex;
		justify-content: flex-end;
		margin-block-start: var(--gap-lg);
		padding-inline: var(--gap-sm);
	}

	.error {
		margin: 0;
		padding: 0 var(--gap-sm);
		color: var(--hue-danger);
	}
</style>
