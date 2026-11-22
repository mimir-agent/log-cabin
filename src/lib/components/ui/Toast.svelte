<!--
@component
One line at the top of the screen, as Campsite's toasts are: something that didn't work, or
something done with a link to it ("Post created · View"). On a phone it keeps clear of the page's
bars: just above the tab bar, or on a detail page, which has a composer along the bottom instead,
just under the page's bar with its Back. It stays 5 seconds, then fades out. Render it once, in
the root layout; call `toast(text)` from anywhere to show one.
-->
<script lang="ts" module>
	type Link = { href: string; label: string };
	type Shown = { id: number; text: string; link?: Link; leaving: boolean };

	const shown = $state<Shown[]>([]);
	let nextId = 0;

	export function toast(text: string, link?: Link) {
		const item = { id: nextId++, text, link, leaving: false };
		shown.push(item);
		setTimeout(() => {
			const live = shown.find((t) => t.id === item.id);
			if (live) live.leaving = true;
		}, 5000);
	}

	function remove(id: number) {
		shown.splice(
			shown.findIndex((t) => t.id === id),
			1
		);
	}
</script>

<div class="toasts" role="status">
	{#each shown as item (item.id)}
		<p
			class="toast"
			data-leaving={item.leaving || undefined}
			onanimationend={() => item.leaving && remove(item.id)}
		>
			{item.text}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolved hrefs -->
			{#if item.link}<a href={item.link.href}>{item.link.label}</a>{/if}
		</p>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		/* At the top on a wide screen: along the bottom sit the composers. */
		inset: calc(var(--gap-lg) + env(safe-area-inset-top)) 0 auto;
		z-index: var(--z-toast);
		display: grid;
		gap: var(--gap-sm);
		justify-items: center;
		padding-inline: var(--gap-md);
		pointer-events: none;
		--toast-from: calc(-1 * var(--gap-sm));
	}

	/* On a phone the top is the page's bar, with Back in it: sit just above the tab bar. */
	@media (max-width: 63.99rem), (pointer: coarse) {
		.toasts {
			inset: auto 0 calc(var(--tab-bar-h) + var(--gap-sm) + env(safe-area-inset-bottom));
			--toast-from: var(--gap-sm);
		}

		/* A detail page has no tab bar, and its composer is along the bottom: sit just under
		   the page's bar instead, clear of Back above and the composer below. */
		:global(:root:has(.page-header[data-detail])) .toasts {
			inset: calc(var(--header-h) + var(--gap-sm)) 0 auto;
			--toast-from: calc(-1 * var(--gap-sm));
		}
	}

	.toast {
		max-inline-size: var(--measure);
		margin: 0;
		padding: var(--gap-sm) var(--gap-md);
		border-radius: var(--radius-control);
		background-color: var(--hue-z2-bg);
		color: var(--hue-z2-fg);
		box-shadow: var(--elevation-popover);
		font-size: var(--type-body);
		line-height: var(--leading-tight);
		pointer-events: auto;
		animation: enter var(--motion-fast) var(--motion-ease-out);
	}

	.toast[data-leaving] {
		animation: leave var(--motion-exit) var(--motion-ease-in) forwards;
	}

	.toast a {
		margin-inline-start: var(--gap-sm);
		color: var(--hue-z2-fg);
		font-weight: var(--fw-semibold);
	}

	@keyframes enter {
		from {
			opacity: 0;
			translate: 0 var(--toast-from);
		}
	}

	@keyframes leave {
		to {
			opacity: 0;
		}
	}
</style>
