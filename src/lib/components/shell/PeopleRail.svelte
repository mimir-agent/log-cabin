<!--
@component
The people beside Home, after Campsite's: a 56px search field, then the team and the guests as
groups that fold away, 32px faces in 48px rows. Hidden below 1024px. Log Cabin has no presence
yet, so there's no "online" group: the team comes first, the viewer at its top.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Role } from '#lib/server/db/schema/index.js';
	import { shell } from '#lib/strings/shell.js';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Avatar from './Avatar.svelte';
	import GroupToggle from './GroupToggle.svelte';

	type Person = { id: string; name: string; role: Role; avatarUrl?: string | null };
	type Props = { people: Person[]; viewerId?: string };

	let { people, viewerId }: Props = $props();

	const s = shell.people;
	const ids = $props.id();
	let query = $state('');
	const open = $state({ team: true, guests: true });

	const byName = (a: Person, b: Person) =>
		Number(b.id === viewerId) - Number(a.id === viewerId) || a.name.localeCompare(b.name);
	const matches = $derived(
		people
			.filter((p) => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
			.sort(byName)
	);
	const searching = $derived(query.trim() !== '');
	const groups = $derived([
		{ key: 'team' as const, label: s.team, people: matches.filter((p) => p.role !== 'guest') },
		{ key: 'guests' as const, label: s.guests, people: matches.filter((p) => p.role === 'guest') }
	]);
</script>

<aside class="rail" aria-label={s.label}>
	<div class="search">
		<span class="search-icon" aria-hidden="true"><Icon name="search" /></span>
		<input
			type="search"
			bind:value={query}
			placeholder={s.search}
			aria-label={s.search}
			autocomplete="off"
			spellcheck="false"
		/>
		{#if searching}
			<button type="button" class="clear" aria-label={s.clear} onclick={() => (query = '')}>
				<Icon name="circle-filled-close" />
			</button>
		{/if}
	</div>

	<div class="list">
		{#if matches.length === 0}
			<p class="none">
				<span class="none-icon" aria-hidden="true"><Icon name="search" size={48} /></span>
				{s.none}
			</p>
		{/if}
		{#each groups as group (group.key)}
			{#if group.people.length}
				<section class="group" aria-label={group.label}>
					<div class="group-head">
						{#if searching}
							<span class="group-label">{group.label}</span>
						{:else}
							<GroupToggle
								bind:open={open[group.key]}
								controls="{ids}-{group.key}"
								storageKey="campfire:home-people-{group.key}"
							>
								{group.label}
							</GroupToggle>
						{/if}
					</div>
					<ul
						class="people"
						id="{ids}-{group.key}"
						role="list"
						hidden={!searching && !open[group.key]}
					>
						{#each group.people as person (person.id)}
							<li>
								<a class="person" href={resolve('/members/[id]', { id: person.id })}>
									<Avatar name={person.name} src={person.avatarUrl} size="md" />
									<span class="name">{person.name}</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
	</div>
</aside>

<style>
	/* 240px, a step back from the page in light mode, the page's own black in dark. */
	.rail {
		position: sticky;
		inset-block-start: 0;
		display: none;
		flex: none;
		flex-direction: column;
		inline-size: var(--rail-w);
		block-size: 100dvb;
		border-inline-start: var(--border-w-hairline) solid var(--hue-z0-border);
		background-color: light-dark(var(--hue-gray-50), var(--hue-z0-bg));
	}

	@media (min-width: 64rem) {
		.rail {
			display: flex;
		}
	}

	/* The search field is the rail's titlebar: 56px, no box, the icon in the quaternary grey. */
	.search {
		position: relative;
		flex: none;
		color: var(--hue-text-quaternary);
	}

	.search-icon,
	.clear {
		position: absolute;
		inset-block-start: 50%;
		display: grid;
		translate: 0 -50%;
	}

	.search-icon {
		inset-inline-start: var(--gap-md);
		pointer-events: none;
	}

	.search input {
		inline-size: 100%;
		block-size: var(--header-h);
		padding-inline: 2.5rem;
		border: 0;
		border-radius: 0;
		outline: none;
		background: transparent;
		color: var(--hue-z0-fg);
		font: inherit;
		font-size: var(--type-control);
	}

	.search input::placeholder {
		color: var(--hue-z0-muted);
	}

	.search input::-webkit-search-cancel-button {
		appearance: none;
	}

	.clear {
		inset-inline-end: var(--gap-md);
		padding: 0;
		border: 0;
		background: none;
		color: var(--hue-text-quaternary);
		cursor: pointer;
	}

	.clear:hover {
		color: var(--hue-text-secondary);
	}

	.list {
		flex: 1;
		padding: 0 0.375rem 0.375rem;
		overflow-y: auto;
		overscroll-behavior: contain;
		border-block-start: var(--border-w-hairline) solid var(--hue-z0-border);
		scrollbar-width: none;
	}

	.group-head {
		display: flex;
		padding: 1.25rem var(--gap-xs) 0;
	}

	.group:first-of-type .group-head {
		padding-block-start: var(--gap-sm);
	}

	.group-label {
		padding: var(--gap-xs);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
		line-height: 1rem;
	}

	.people {
		margin: 0;
		padding: 0 var(--gap-xs);
		list-style: none;
	}

	/* 48px: a 32px face, 8px above and below, 12px to the name. */
	.person {
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		padding: var(--gap-sm) 0.375rem var(--gap-sm) var(--gap-sm);
		border-radius: var(--radius-control);
		color: var(--hue-z0-fg);
		font-size: var(--type-body);
		line-height: 1.375;
		text-decoration: none;
	}

	.person:hover {
		background-color: light-dark(var(--hue-gray-100), var(--hue-gray-800));
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.none {
		display: grid;
		justify-items: center;
		gap: var(--gap-xs);
		margin: 0;
		padding: var(--gap-2xl) var(--gap-md);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		text-align: center;
	}

	.none-icon {
		display: grid;
		color: var(--hue-z0-fg);
		opacity: 0.2;
	}
</style>
