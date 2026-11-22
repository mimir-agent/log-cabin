<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Thread/Bubble/MessageCallBubble.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
A call in a thread's timeline, after Campsite's CallBubble (apps/web/components/Thread/Bubble,
CC BY-NC 4.0): while it goes on, who's in it and Join; once ended, how long it ran and who
was there.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { calls } from '#lib/strings/calls.js';

	type Props =
		| { live: true; id: string; names: string[] }
		| { live: false; id: string; names: string[]; durationMs: number };

	let call: Props = $props();
	const s = calls.place;
</script>

<div class="call" data-live={call.live || undefined} role={call.live ? 'status' : undefined}>
	<span class="mark" aria-hidden="true">
		<Icon name={call.live ? 'video-camera-filled' : 'video-camera'} size={20} />
	</span>
	<span class="what">
		{call.live ? s.live(call.names) : s.ended(Math.round(call.durationMs / 60_000), call.names)}
	</span>
	{#if call.live}
		<Button href={resolve('/calls/[id]', { id: call.id })} variant="primary" size="sm">
			{s.join}
		</Button>
	{/if}
</div>

<style>
	.call {
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		align-self: center;
		max-inline-size: 100%;
		margin: var(--gap-sm) 0;
		padding: var(--gap-sm) var(--gap-md);
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-surface);
		background-color: var(--hue-z1-bg);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}

	.call[data-live] {
		color: var(--hue-z1-fg);
		font-size: var(--type-body);
	}

	.mark {
		display: grid;
		flex: none;
	}

	.call[data-live] .mark {
		color: var(--hue-call);
	}
</style>
