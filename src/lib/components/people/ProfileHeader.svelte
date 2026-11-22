<script lang="ts">
	import type { Snippet } from 'svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import { isActive } from '#lib/people/seen.js';
	import { people } from '#lib/strings/people.js';
	import type { Status } from '#lib/people/status.js';
	import LocalTime from './LocalTime.svelte';
	import StatusLine from './StatusLine.svelte';

	type Props = {
		person: {
			name: string;
			avatarUrl: string | null;
			coverUrl: string | null;
			status: Status | null;
			timezone: string;
			lastSeenAt: number | null;
		};
		/** Next to the status: the picker, on your own profile. */
		statusAction?: Snippet;
		/** Under the local time: the quiet facts. */
		children?: Snippet;
	};

	let { person, statusAction, children }: Props = $props();
	const active = $derived(isActive(person.lastSeenAt, Date.now()));
</script>

<!-- Who this is, after Campsite's profile header: the face, the name, the quiet facts. -->
<header class="profile-header">
	{#if person.coverUrl}
		<img class="cover" src={person.coverUrl} alt="" />
	{/if}
	<div class="who">
		<Avatar
			name={person.name}
			src={person.avatarUrl}
			size="xl"
			presence={active ? 'online' : null}
			presenceLabel={active ? people.seen.activeNow : undefined}
		/>
		<div class="names">
			<h2 class="name">{person.name}</h2>
			{#if person.status || statusAction}
				<p class="row">
					{#if person.status}<StatusLine status={person.status} />{/if}
					{@render statusAction?.()}
				</p>
			{/if}
			<p class="muted"><LocalTime timezone={person.timezone} lastSeenAt={person.lastSeenAt} /></p>
			{@render children?.()}
		</div>
	</div>
</header>

<style>
	.profile-header {
		display: grid;
		gap: var(--gap-xl);
	}

	.cover {
		display: block;
		inline-size: 100%;
		aspect-ratio: 3;
		object-fit: cover;
		border-radius: var(--radius-surface);
	}

	.who {
		display: flex;
		gap: var(--gap-lg);
		align-items: center;
	}

	.names {
		display: grid;
		gap: var(--gap-xs);
		min-inline-size: 0;
	}

	/* On a page of its own a long name wraps onto more lines (parity.md §1). */
	.name {
		margin: 0;
		font-size: var(--type-title);
		font-weight: var(--fw-semibold);
		line-height: var(--leading-tight);
		text-wrap: balance;
		overflow-wrap: anywhere;
	}

	p {
		margin: 0;
		font-size: var(--type-body);
	}

	.row,
	.muted {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-sm);
	}

	.muted {
		color: var(--hue-z0-muted);
	}

	/* With no status, the picker's ghost button opens the row: pull its text back to the name's
	   edge, so the label lines up with everything else and only its hover fill sticks out. */
	.row > :global(.button:first-child) {
		margin-inline-start: calc(var(--gap-sm) * -1);
	}
</style>
