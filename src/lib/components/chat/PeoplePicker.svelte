<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Chat/CreateChatThreadDialog.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
A list of people to choose from, after Campsite's New chat dialog (CreateChatThreadDialog,
CC BY-NC 4.0): 40px rows, a face and a name each. `one` makes each row a submit button sending
`person`; `many` gives each a checkbox sending `people`.
-->
<script lang="ts">
	import Avatar from '#lib/components/shell/Avatar.svelte';

	type Props = { people: { id: string; name: string }[]; choose: 'one' | 'many' };

	let { people, choose }: Props = $props();
</script>

<ul role="list" class="people">
	{#each people as person (person.id)}
		<li>
			{#if choose === 'one'}
				<button class="row" type="submit" name="person" value={person.id}>
					<span aria-hidden="true"><Avatar name={person.name} size="sm" /></span>
					<span class="label">{person.name}</span>
				</button>
			{:else}
				<label class="row">
					<span aria-hidden="true"><Avatar name={person.name} size="sm" /></span>
					<span class="label">{person.name}</span>
					<input type="checkbox" name="people" value={person.id} />
				</label>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.people {
		display: grid;
		gap: 0.125rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Campsite's command rows: 40px, 8px radius, 8px in, 12px between face and name. */
	.row {
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		inline-size: 100%;
		min-block-size: var(--control-h-lg);
		padding: 0 var(--gap-sm);
		border: 0;
		border-radius: var(--radius-surface);
		background: none;
		color: var(--hue-z0-fg);
		font: inherit;
		font-size: 0.9375rem;
		text-align: start;
		cursor: pointer;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	.row:hover,
	.row:focus-visible,
	.row:has(:focus-visible) {
		background-color: var(--hue-hover);
	}

	.label {
		flex: 1;
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	input[type='checkbox'] {
		inline-size: 1rem;
		block-size: 1rem;
		margin: 0;
		accent-color: var(--hue-accent);
	}
</style>
