<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import FacePile from '#lib/components/ui/FacePile.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { calls as strings } from '#lib/strings/calls.js';

	type Props = {
		id: string;
		/** What is going on: where the call is, or who is in it. */
		label: string;
		startedAt: number;
		/** Who is in the call now; a guest has no account, so no userId. */
		people: { id: string; userId: string | null; name: string; avatarUrl: string | null }[];
	};

	const { id, label, startedAt, people }: Props = $props();
	const s = strings.index;

	// The clock is text, so it moves no more than a minute at a time, whatever the motion setting.
	let now = $state(Date.now());
	$effect(() => {
		const tick = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(tick);
	});
	const minutes = $derived(Math.max(0, Math.floor((now - startedAt) / 60_000)));
	const faces = $derived(
		people.map((p) => ({
			id: p.id,
			name: p.name,
			src: p.avatarUrl,
			href: p.userId ? resolve('/people/id/[userId]', { userId: p.userId }) : undefined
		}))
	);
</script>

<!-- A call happening now: Campsite's green call mark, what it is and for how long, who is in it,
     and Join. -->
<div class="live" role="status">
	<span class="mark" aria-hidden="true"><Icon name="video-camera-filled" size={24} /></span>
	<span class="what">
		<span class="label">{label}</span>
		<span class="elapsed">{s.elapsed(minutes)}</span>
	</span>
	{#if faces.length > 0}
		<FacePile people={faces} label={s.inCall(people.map((p) => p.name))} surface="z1" />
	{/if}
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
		display: grid;
		flex: 1;
		min-inline-size: 0;
	}

	.label {
		font-size: 0.9375rem;
		font-weight: var(--fw-medium);
	}

	.elapsed {
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-variant-numeric: tabular-nums;
	}
</style>
