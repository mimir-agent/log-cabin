<script lang="ts">
	import { page } from '$app/state';
	// Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/MemberLocalTime.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/
	import { onMount } from 'svelte';
	import { isActive, lastSeenText } from '#lib/people/seen.js';
	import { clockTime, hoursAhead } from '#lib/people/time.js';
	import { people } from '#lib/strings/people.js';
	import { time } from '#lib/strings/time.js';

	type Props = { timezone: string; lastSeenAt: number | null };
	let { timezone, lastSeenAt }: Props = $props();

	let now = $state(Date.now());
	// Your own time zone is only known in the browser, so the difference shows once mounted.
	let yours = $state<string | null>(null);

	onMount(() => {
		yours = Intl.DateTimeFormat().resolvedOptions().timeZone;
		now = Date.now();
		const tick = setInterval(() => (now = Date.now()), 15_000);
		return () => clearInterval(tick);
	});

	const difference = $derived.by(() => {
		if (!yours) return null;
		const ahead = hoursAhead(now, timezone, yours);
		if (ahead === 0) return null;
		const hours = people.time.hours(Math.abs(ahead));
		return ahead > 0 ? people.time.ahead(hours) : people.time.behind(hours);
	});
</script>

<span class="facts">
	<span>{people.time.local(clockTime(now, timezone))}</span>
	{#if difference}<span class="muted">({difference})</span>{/if}
	<span aria-hidden="true">·</span>
	{#if lastSeenAt === null}
		<span>{lastSeenText(lastSeenAt, now)}</span>
	{:else}
		<time
			class="seen"
			datetime={new Date(lastSeenAt).toISOString()}
			title={time.long(lastSeenAt, page.data.timeZone)}
			data-active={isActive(lastSeenAt, now) || undefined}
		>
			{lastSeenText(lastSeenAt, now)}
		</time>
	{/if}
</span>

<style>
	.facts {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-xs);
	}

	.muted {
		color: var(--hue-z0-muted);
	}

	.seen[data-active]::before {
		content: '';
		display: inline-block;
		inline-size: var(--gap-sm);
		block-size: var(--gap-sm);
		margin-inline-end: var(--gap-xs);
		border-radius: 50%;
		background-color: var(--hue-online);
	}
</style>
