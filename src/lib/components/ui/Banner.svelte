<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/**
		 * neutral: information about the page (reconnecting, a note is read-only).
		 * live: something is being captured right now (a recording). Leads with a red dot.
		 * warning: a problem that hasn't lost anything yet (offline, changes not saved).
		 * danger: something failed and needs the reader.
		 */
		tone?: 'neutral' | 'live' | 'warning' | 'danger';
		children: Snippet;
		/** At most one button or link, at the end. */
		action?: Snippet;
	};

	let { tone = 'neutral', children, action }: Props = $props();
</script>

<!-- A banner appears in place of nothing, so it announces itself; danger interrupts. -->
<div class="banner" data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
	{#if tone === 'live'}<span class="dot" aria-hidden="true"></span>{/if}
	<p class="message">{@render children()}</p>
	{#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
	.banner {
		--banner-mark: var(--hue-z1-muted);
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-block-size: var(--control-h-lg);
		padding: var(--gap-xs) var(--gap-xs) var(--gap-xs) var(--gap-md);
		border: var(--border-w-hairline) solid var(--hue-z1-border);
		border-inline-start: var(--border-w-thick) solid var(--banner-mark);
		border-radius: var(--radius-control);
		background-color: var(--hue-z1-bg);
		color: var(--hue-z1-fg);
		font-size: var(--type-body);
		line-height: var(--leading-tight);
	}

	.banner[data-tone='live'],
	.banner[data-tone='danger'] {
		--banner-mark: var(--hue-live);
	}

	.banner[data-tone='warning'] {
		--banner-mark: var(--hue-warning);
	}

	.message {
		flex: 1;
		min-inline-size: 0;
		margin: 0;
		padding-block: var(--gap-xs);
		text-wrap: pretty;
	}

	.action {
		flex: none;
	}

	/* Breathes slowly: present without pulling the eye every second. Reduced motion stops it. */
	.dot {
		flex: none;
		inline-size: 0.5rem;
		block-size: 0.5rem;
		border-radius: var(--radius-full);
		background-color: var(--hue-live);
		animation: breathe 2s var(--ease-in-out) infinite;
	}

	@keyframes breathe {
		50% {
			opacity: 0.35;
		}
	}
</style>
