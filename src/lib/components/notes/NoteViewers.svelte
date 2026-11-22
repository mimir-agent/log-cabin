<!--
@component
The note titlebar's "Seen by", as Campsite's note viewers popover: who else has opened the note,
latest first, then how many times it was opened signed out. Shows nothing until there is someone.
-->
<script lang="ts">
	import { page } from '$app/state';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Popover from '#lib/components/ui/Popover.svelte';
	import { notes } from '#lib/strings/notes.js';
	import { time } from '#lib/strings/time.js';

	type Viewer = { id: string; name: string; avatarUrl: string | null; viewedAt: number };
	type Props = { people: Viewer[]; anonymous: number };

	const { people, anonymous }: Props = $props();
	const s = notes.views;
</script>

{#if people.length || anonymous}
	<Popover align="end" width="20rem" label={s.title}>
		{#snippet trigger({ props })}
			<IconButton {...props} icon="eye" label={s.title} />
		{/snippet}
		<h2 class="title">{s.title}</h2>
		<ul class="viewers" role="list">
			{#each people as person (person.id)}
				<li>
					<span aria-hidden="true"
						><Avatar name={person.name} src={person.avatarUrl} size="xs" /></span
					>
					<span class="name" title={person.name}>{person.name}</span>
					<time
						datetime={new Date(person.viewedAt).toISOString()}
						title={time.long(person.viewedAt, page.data.timeZone)}
						>{time.short(person.viewedAt, page.data.timeZone)}</time
					>
				</li>
			{/each}
		</ul>
		{#if anonymous}<p class="anonymous">{s.anonymous(anonymous)}</p>{/if}
	</Popover>
{/if}

<style>
	.title {
		margin: 0 0 var(--gap-sm);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
	}

	.viewers {
		display: grid;
		gap: var(--gap-xs);
		max-block-size: 40vh;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	.viewers li {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-block-size: var(--control-h-sm);
	}

	.name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	time,
	.anonymous {
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}

	.anonymous {
		margin: var(--gap-sm) 0 0;
	}
</style>
