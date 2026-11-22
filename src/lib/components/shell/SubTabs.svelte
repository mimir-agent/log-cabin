<!--
@component
Sections of one page as tabs under its titlebar, after Campsite's SubnavigationTab
(apps/web/components/Titlebar/Subnavigation.tsx; CC BY-NC 4.0): centred in the 768px column,
16px apart, 14px medium in the third grey, the current one in ink with a 2px rule on the line
below. Hovering a tab greys its rule in. Links, so each section has its own URL.
-->
<script lang="ts">
	type Tab = { href: string; label: string; current: boolean };

	type Props = {
		/** Names the set for screen readers, e.g. the page's title. */
		label: string;
		tabs: Tab[];
	};

	let { label, tabs }: Props = $props();
</script>

<nav class="subtabs" aria-label={label}>
	<div class="row">
		{#each tabs as tab (tab.href)}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolved hrefs -->
			<a class="tab" href={tab.href} aria-current={tab.current ? 'page' : undefined}>{tab.label}</a>
		{/each}
	</div>
</nav>

<style>
	.subtabs {
		position: sticky;
		inset-block-start: var(--header-h);
		z-index: var(--z-sticky);
		flex: none;
		padding-inline: var(--gap-lg);
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
		background-color: var(--hue-z0-bg);
	}

	.row {
		display: flex;
		gap: var(--gap-lg);
		justify-content: center;
		max-inline-size: 48rem;
		margin-inline: auto;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.tab {
		position: relative;
		display: flex;
		align-items: center;
		padding-block: var(--gap-lg);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		line-height: var(--leading-tight);
		text-decoration: none;
		white-space: nowrap;
		transition: color var(--motion-fast) var(--motion-ease);
	}

	.tab::after {
		content: '';
		position: absolute;
		inset: auto 0 -1px;
		block-size: 2px;
		border-radius: var(--radius-full);
		background-color: transparent;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	.tab:hover {
		color: var(--hue-text-secondary);
	}

	.tab:hover::after {
		background-color: var(--hue-text-quaternary);
	}

	.tab[aria-current='page'] {
		color: var(--hue-z0-fg);
	}

	.tab[aria-current='page']::after {
		background-color: var(--hue-z0-fg);
	}

	.tab:focus-visible {
		outline-offset: calc(var(--focus-ring-width) * -1);
	}
</style>
