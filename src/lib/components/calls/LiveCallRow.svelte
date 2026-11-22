<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { calls as strings } from '#lib/strings/calls.js';

	type Props = { id: string; /** What is going on: who is in the call, or where. */ label: string };

	const { id, label }: Props = $props();
</script>

<!-- A call happening now: Campsite's green call mark, what it is, and Join. -->
<div class="live" role="status">
	<span class="mark" aria-hidden="true"><Icon name="video-camera-filled" size={24} /></span>
	<span class="what">{label}</span>
	<Button href={resolve('/calls/[id]', { id })} variant="primary" size="sm">
		{strings.place.join}
	</Button>
</div>

<style>
	.live {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		padding: 0.625rem 0.5rem 0.625rem 0.75rem;
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-surface);
		background-color: var(--hue-z1-bg);
	}

	.mark {
		display: grid;
		flex: none;
		place-items: center;
		inline-size: 2.75rem;
		block-size: 2.75rem;
		border-radius: var(--radius-full);
		background-color: var(--hue-call-subtle);
		color: var(--hue-call);
	}

	.what {
		flex: 1;
		min-inline-size: 0;
		font-size: 0.9375rem;
		font-weight: var(--fw-medium);
	}
</style>
