<script lang="ts">
	import { resolve } from '$app/paths';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import HoverCard from '#lib/components/ui/HoverCard.svelte';
	import MessageButton from '#lib/components/chat/MessageButton.svelte';
	import type { Status } from '#lib/people/status.js';
	import { isActive } from '#lib/people/seen.js';
	import { people } from '#lib/strings/people.js';
	import LocalTime from './LocalTime.svelte';
	import StatusLine from './StatusLine.svelte';

	type Card = {
		name: string;
		username: string;
		avatarUrl: string | null;
		status: Status | null;
		timezone: string;
		lastSeenAt: number | null;
		canMessage: boolean;
	};

	/** A person's name that opens their card on hover or focus, and their profile on click. */
	let { userId, name }: { userId: string; name: string } = $props();

	let card = $state<Card | null>(null);
	let failed = $state(false);

	async function load(open: boolean) {
		if (!open || card) return;
		const response = await fetch(`/people/id/${encodeURIComponent(userId)}/card`);
		if (!response.ok) {
			failed = true;
			return;
		}
		card = await response.json();
	}
</script>

<HoverCard onOpenChange={load}>
	{#snippet trigger({ props })}
		<a {...props} class="name" href={resolve('/people/id/[userId]', { userId })}>{name}</a>
	{/snippet}
	{#if card}
		{@const active = isActive(card.lastSeenAt, Date.now())}
		<Avatar
			name={card.name}
			src={card.avatarUrl}
			size="lg"
			presence={active ? 'online' : null}
			presenceLabel={active ? people.seen.activeNow : undefined}
		/>
		<p>
			<strong>{card.name}</strong>
			<span class="muted">{people.username.at(card.username)}</span>
		</p>
		{#if card.status}<p><StatusLine status={card.status} /></p>{/if}
		<p class="caption">
			<LocalTime timezone={card.timezone} lastSeenAt={card.lastSeenAt} />
		</p>
		{#if card.canMessage}<p><MessageButton {userId} size="sm" /></p>{/if}
	{:else if failed}
		<p>{people.card.unavailable}</p>
	{:else}
		<p class="muted">{people.card.loading}</p>
	{/if}
</HoverCard>

<style>
	.name {
		color: inherit;
		font-weight: var(--fw-semibold);
		text-decoration: none;
	}

	.name:hover {
		text-decoration: underline;
	}

	p {
		margin: 0;
	}

	.muted,
	.caption {
		color: var(--hue-z2-muted);
	}

	.caption {
		font-size: var(--type-caption);
	}
</style>
