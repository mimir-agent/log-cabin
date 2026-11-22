<!--
@component
One group of settings, after Campsite's SettingsSection (apps/web/components/SettingsSection;
CC BY-NC 4.0): a card with a 16px medium title, a line in the third grey under it, a rule, the
fields, and a footer strip that holds the Save button at the end. In dark it sits one step up
from the page.

`flush` drops the body's padding, for a list of `SettingsRow`s that run edge to edge.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		description?: string;
		/** Beside the title, at the end: "New tag", "Connect". */
		actions?: Snippet;
		/** The fields or rows. */
		children?: Snippet;
		/** Under a top rule, at the end: Save, and the saved or failed line before it. */
		footer?: Snippet;
		flush?: boolean;
		id?: string;
	};

	let { title, description, actions, children, footer, flush = false, id }: Props = $props();
	const headingId = $props.id();
</script>

<section class="section" {id} aria-labelledby={headingId}>
	<div class="header">
		<h2 class="title" id={headingId}>{title}</h2>
		{#if actions}<div class="actions">{@render actions()}</div>{/if}
	</div>
	{#if description}<p class="description">{description}</p>{/if}
	{#if children}
		<div class="body" data-flush={flush ? '' : undefined}>{@render children()}</div>
	{/if}
	{#if footer}<div class="footer">{@render footer()}</div>{/if}
</section>

<style>
	.section {
		display: flex;
		flex-direction: column;
		inline-size: 100%;
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-surface);
		background-color: var(--hue-section-bg);
		scroll-margin: var(--gap-lg);
	}

	.header {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-md);
		align-items: center;
		justify-content: space-between;
		padding: var(--gap-md) var(--gap-md) 0;
	}

	.title {
		margin: 0;
		font-size: var(--text-md);
		font-weight: var(--fw-medium);
		line-height: 1.5;
	}

	.actions {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
	}

	.description {
		margin: 0.125rem 0 0;
		padding-inline: var(--gap-md);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: var(--leading-tight);
		text-wrap: pretty;
	}

	/* The rule between what the section is and what's in it: a full-width step of grey. */
	.body {
		display: grid;
		gap: 1.25rem;
		margin-block-start: var(--gap-md);
		padding: var(--gap-md);
		border-block-start: 1px solid var(--hue-selected);
	}

	.body[data-flush] {
		gap: 0;
		padding: 0;
	}

	/* Rows in a flush body: a hairline between each, whatever wraps them (a form, a list item). */
	.body[data-flush] > :global(* + *) {
		border-block-start: var(--border-w-hairline) solid var(--hue-border-secondary);
	}

	.footer {
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		justify-content: flex-end;
		padding: var(--gap-md);
		border-block-start: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: 0 0 var(--radius-surface) var(--radius-surface);
	}

	/* No body: the header and its line need their own room before the footer. */
	.section > :is(.header, .description):last-child,
	.section > :is(.header, .description):has(+ .footer) {
		padding-block-end: var(--gap-md);
	}

	@media (max-width: 39.99rem) {
		.footer {
			flex-wrap: wrap;
		}

		.footer :global(.status) {
			flex-basis: 100%;
		}

		.footer :global(:is(.button, button)) {
			flex: 1;
		}
	}
</style>
