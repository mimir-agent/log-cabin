<!--
@component
A page's views as Campsite draws them (`InboxViewOptions`, the Home filters): 30px buttons, 2px
apart, the current one in a soft fill, every label in the ink colour. Links, so each view has a
URL and the back button works.

`place="bar"` sits in the titlebar and only shows from 1024px. `place="strip"` is the row under
the small-screen bar and only shows below 1024px; on a phone the views share the width evenly,
as Campsite's do.
-->
<script lang="ts">
	import { navigating } from '$app/state';
	type View = {
		href: string;
		label: string;
		current: boolean;
	};

	type Props = {
		label: string;
		views: View[];
		place: 'bar' | 'strip';
	};

	let { label, views, place }: Props = $props();

	// A view being opened is current from the moment it's chosen.
	const target = $derived(navigating.to && navigating.to.url.pathname + navigating.to.url.search);
	const opening = $derived(views.find((v) => v.href === target));
	const isCurrent = (view: View) => (opening ? view === opening : view.current);
</script>

<nav class="views" data-place={place} aria-label={label}>
	{#each views as view (view.href)}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolved hrefs -->
		<a class="view" href={view.href} aria-current={isCurrent(view) ? 'page' : undefined}>
			{view.label}
		</a>
	{/each}
</nav>

<style>
	.views {
		display: flex;
		gap: 2px;
	}

	.view {
		display: inline-flex;
		gap: var(--gap-sm);
		align-items: center;
		justify-content: center;
		block-size: var(--control-h-sm);
		padding-inline: 0.625rem;
		border-radius: var(--radius-control);
		color: var(--hue-z0-fg);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		text-decoration: none;
		white-space: nowrap;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	.view:hover {
		background-color: var(--hue-fill);
	}

	.view[aria-current='page'] {
		background-color: var(--hue-fill);
	}

	.view[aria-current='page']:hover,
	.view:active {
		background-color: var(--hue-pressed);
		transition-duration: var(--motion-instant);
	}

	.views[data-place='strip'] {
		display: none;
	}

	@media (max-width: 63.99rem) {
		.views[data-place='bar'] {
			display: none;
		}

		.views[data-place='strip'] {
			display: flex;
			flex: none;
			padding: 0.375rem var(--gap-md);
			border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
		}
	}

	@media (max-width: 47.99rem) {
		.views[data-place='strip'] .view {
			flex: 1;
		}
	}
</style>
