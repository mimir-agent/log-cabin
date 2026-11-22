<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { shell } from '#lib/strings/shell.js';
	import { shellContext } from './AppShell.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Avatar from './Avatar.svelte';
	import MarkDone from './MarkDone.svelte';

	type Props = {
		title: string;
		/** A back link, breadcrumb or icon before the title. */
		leading?: Snippet;
		/** One quiet line beside the title: a count, a description, who can see it. */
		description?: Snippet;
		/** Controls that belong beside the title: a page's view tabs (Notes: Recent, Mine). */
		tools?: Snippet;
		/** Buttons on the trailing edge. The primary action goes last. */
		actions?: Snippet;
		/** Only the small-screen bar; on wide screens the page names itself (Home). */
		mobileOnly?: boolean;
		/**
		 * A detail page's way back, for small screens: an arrow in place of the org mark, and no
		 * tab bar, as Campsite does on a post, a doc or a conversation.
		 */
		back?: string;
		/**
		 * The page's parent list, for small screens: the same arrow, with the tab bar kept, as
		 * Campsite does on a channel's posts.
		 */
		parent?: string;
		/**
		 * Small screens only: what follows the name, a lock or Archived. Giving it also drops
		 * everything else beside the name there (the mark, the description, the tools): a
		 * channel's bar is back, name, actions.
		 */
		marks?: Snippet;
		/**
		 * From 1024px the title is read out but not shown, and `tools` take its place: Campsite's
		 * inbox titlebar holds only its views. Small screens still show the name in the bar.
		 */
		titleHidden?: boolean;
		/**
		 * Below 1024px the title is read out but not shown, so the bar is the way back and its
		 * actions: Campsite's note titlebar, where the page's own heading names the note.
		 */
		phoneTitleHidden?: boolean;
		/**
		 * The description goes under the title instead of beside it, as in Campsite's
		 * conversation titlebar (name, then "4 members" or the person's local time).
		 */
		stacked?: boolean;
		/**
		 * The name in the middle of the bar at every width, at 14px semibold, with no line under
		 * it: Campsite's settings titlebar, which has its tabs right below.
		 */
		centered?: boolean;
	};

	let {
		title,
		leading,
		description,
		tools,
		actions,
		mobileOnly = false,
		back,
		parent,
		marks,
		titleHidden = false,
		phoneTitleHidden = false,
		stacked = false,
		centered = false
	}: Props = $props();

	const ctx = shellContext();
	const up = $derived(back ?? parent);
	// The page's path when the inbox holds something about it still; the root layout says so.
	const done = $derived(page.data.about?.itemKeys.length ? page.data.about.path : null);
</script>

<header
	class="page-header"
	data-mobile-only={mobileOnly ? '' : undefined}
	data-detail={back ? '' : undefined}
	data-marks={marks ? '' : undefined}
	data-title-hidden={titleHidden ? '' : undefined}
	data-phone-title-hidden={phoneTitleHidden ? '' : undefined}
	data-stacked={stacked ? '' : undefined}
	data-centered={centered ? '' : undefined}
>
	<div class="start">
		{#if up}
			<IconButton href={up} icon="arrow-left" label={shell.back} />
		{:else if ctx}
			<button type="button" class="org" data-press aria-label={shell.openNav} onclick={ctx.openNav}>
				<Avatar name={ctx.orgName} src={ctx.orgLogoUrl} size="md" shape="square" />
			</button>
		{/if}
	</div>
	<div class="middle">
		{@render leading?.()}
		<div class="text">
			<h1 class="title">{title}</h1>
			{#if marks}<div class="marks">{@render marks()}</div>{/if}
			{#if description}
				<p class="description">{@render description()}</p>
			{/if}
			{@render tools?.()}
		</div>
	</div>
	{#if actions || done}
		<div class="actions">
			{#if done}<MarkDone path={done} />{/if}
			{@render actions?.()}
		</div>
	{/if}
</header>

<style>
	/* Campsite's titlebar: 56px, 14px sides, 12px gaps, a hairline under it, the title at 15px
	   medium. It names the page quietly; the content does the talking. */
	.page-header {
		position: sticky;
		inset-block-start: 0;
		z-index: var(--z-sticky);
		display: flex;
		flex: none;
		gap: var(--gap-md);
		align-items: center;
		block-size: var(--header-h);
		padding-block-start: env(safe-area-inset-top);
		padding-inline: 0.875rem;
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
		background-color: var(--hue-z0-bg);
	}

	.text {
		display: flex;
		flex: 1;
		gap: var(--gap-sm);
		align-items: baseline;
		min-inline-size: 0;
	}

	.start {
		display: none;
	}

	.middle {
		display: flex;
		flex: 1;
		gap: var(--gap-md);
		align-items: center;
		min-inline-size: 0;
	}

	.title {
		margin: 0;
		overflow: hidden;
		font-size: 0.9375rem;
		font-weight: var(--fw-medium);
		line-height: 1.25;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.marks {
		display: none;
		flex: none;
		gap: var(--gap-xs);
		align-items: center;
	}

	.description {
		margin: 0;
		overflow: hidden;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: 1.25;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	[data-stacked] .text {
		flex-direction: column;
		gap: 0;
		align-items: flex-start;
	}

	[data-stacked] .title,
	[data-stacked] .description {
		max-inline-size: 100%;
	}

	/* Campsite: the title, then the quiet line at 12px under it. */
	[data-stacked] .description {
		font-size: var(--type-caption);
		line-height: 1rem;
	}

	.actions {
		display: flex;
		flex: none;
		gap: 0.375rem;
		align-items: center;
	}

	.org {
		display: grid;
		place-items: center;
		inline-size: var(--tap-min);
		block-size: var(--tap-min);
		margin-inline-start: calc(var(--gap-xs) * -1);
		padding: 0;
		border: 0;
		border-radius: var(--radius-surface);
		background: none;
		cursor: pointer;
	}

	.page-header[data-mobile-only] {
		display: none;
	}

	.page-header[data-centered] {
		display: grid;
		grid-template-columns: 1fr minmax(0, auto) 1fr;
		border-block-end: 0;
	}

	[data-centered] .middle {
		grid-column: 2;
		gap: var(--gap-md);
		justify-content: center;
	}

	[data-centered] .title {
		font-size: var(--type-body);
		font-weight: var(--fw-semibold);
	}

	[data-centered] .actions {
		grid-column: 3;
		justify-self: end;
	}

	@media (min-width: 64rem) {
		[data-title-hidden] .title {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}

	/* Below 1024px the header is the page's only bar, on Campsite's grid: the org mark (or a
	   way back) at the start, the page's name centred at 16px semibold, its actions at the end.
	   Both sides are two buttons wide, so the title is centred on the screen until it's too
	   long to be, and the buttons run to 6px from the edges: the ink of an icon in a 44px
	   button lands about 22px in. The shell pads the sides for a notch already. */
	@media (max-width: 63.99rem) {
		.page-header,
		.page-header[data-mobile-only] {
			display: grid;
			grid-template-columns: 1fr minmax(0, auto) 1fr;
			gap: 0;
			padding-inline: 0.375rem;
		}

		.start {
			display: flex;
			grid-column: 1;
			align-items: center;
			min-inline-size: calc(var(--tap-min) * 2);
		}

		.org {
			margin-inline-start: 0;
		}

		.middle {
			grid-column: 2;
			justify-content: center;
			padding-inline: var(--gap-sm);
		}

		.text {
			flex: 0 1 auto;
			align-items: center;
		}

		.actions {
			grid-column: 3;
			gap: 0;
			justify-content: flex-end;
			justify-self: end;
			min-inline-size: calc(var(--tap-min) * 2);
		}

		/* A stacked bar's name and marks still sit in one row. */
		[data-marks] .text {
			flex-direction: row;
			gap: var(--gap-sm);
			align-items: center;
		}

		/* The marks are ChannelMarks' markup, so `*` has to be global or the rule is pruned. */
		[data-marks] .marks:has(:global(*)) {
			display: flex;
		}

		/* What the page put beside the name is its own markup, so it isn't scoped to this one. */
		[data-marks] .middle > :global(:not(.text)),
		[data-marks] .text > :global(:not(.title, .marks)) {
			display: none;
		}

		.title {
			font-size: var(--text-md);
			font-weight: var(--fw-semibold);
			text-align: center;
		}

		[data-phone-title-hidden] .title {
			position: absolute;
			inline-size: 1px;
			block-size: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}

		.description {
			display: none;
		}

		/* A stacked line is part of the name (a conversation's member count), so it stays. */
		[data-stacked] .description {
			display: block;
		}
	}
</style>
