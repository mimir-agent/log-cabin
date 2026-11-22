<!--
@component
What are you making? The sidebar's New button and the phone's compose + open this menu: a post
that tells people, or a doc that stays. The first row is lit when it opens. A button that opens
it carries `data-create-trigger`, so the `c` shortcut can find the one on screen.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { DropdownMenu } from 'bits-ui';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import { resolve } from '$app/paths';
	import { shell } from '#lib/strings/shell.js';

	type Props = {
		/** Where the post row goes: the post dialog over the first project. */
		newPostHref: string;
		/** The button that opens it. Spread `props` on it. */
		button: Snippet<[{ props: Record<string, unknown> }]>;
	};

	const { newPostHref, button }: Props = $props();
	const s = shell.create;

	/** Lights the first row once the menu has taken focus itself. */
	const lit = (row: HTMLElement) => {
		const timer = setTimeout(() => row.focus());
		return () => clearTimeout(timer);
	};
</script>

<!-- 316px: each muted line fits on one line. -->
<Menu align="start" minWidth="19.75rem">
	{#snippet trigger({ props })}
		{@render button({ props })}
	{/snippet}
	<DropdownMenu.Item>
		{#snippet child({ props })}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved by the caller -->
			<a {...props} class="row" href={newPostHref} {@attach lit}>
				<Icon name="post" />
				{@render words(s.post.title, s.post.line)}
			</a>
		{/snippet}
	</DropdownMenu.Item>
	<DropdownMenu.Item>
		{#snippet child({ props })}
			<a {...props} class="row" href={resolve('/notes/new')}>
				<Icon name="note" />
				{@render words(s.doc.title, s.doc.line)}
			</a>
		{/snippet}
	</DropdownMenu.Item>
</Menu>

{#snippet words(title: string, line: string)}
	<span class="words">
		<span>{title}</span>
		<span class="line">{line}</span>
	</span>
{/snippet}

<style>
	/* Heavier than the menu's own row rule, which these rows would otherwise lose to on a tie. */
	a.row[data-dropdown-menu-item] {
		align-items: flex-start;
		gap: var(--gap-md);
		padding-block: var(--gap-sm);
	}

	.words {
		display: grid;
		gap: 1px;
	}

	.line {
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-weight: var(--fw-regular);
		line-height: var(--leading-tight);
	}
</style>
