<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { calls as strings } from '#lib/strings/calls.js';

	let { people }: { people: { id: string; name: string }[] } = $props();
	const s = strings.ringing;
	let open = $state(false);
</script>

<!-- Campsite's invite sits beside the call's title as a quiet button; the people are rows of a
     face and a name, ticked on the right. -->
<Dialog bind:open title={s.inviteTitle} description={s.inviteIntro} size="sm">
	{#snippet trigger({ props })}
		<Button {...props} variant="ghost" size="sm">
			<Icon name="user-circle-plus" size={16} />{s.invite}
		</Button>
	{/snippet}
	{#if people.length === 0}
		<p class="none">{s.noOneToInvite}</p>
	{:else}
		<form
			id="invite-people"
			method="POST"
			action="?/invite"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					open = false;
				}}
		>
			<ul role="list" class="people">
				{#each people as person (person.id)}
					<li>
						<label class="person">
							<Avatar name={person.name} size="sm" />
							<span class="name">{person.name}</span>
							<input type="checkbox" name="invitee" value={person.id} />
						</label>
					</li>
				{/each}
			</ul>
		</form>
	{/if}
	{#snippet actions()}
		<Button onclick={() => (open = false)}>{s.cancel}</Button>
		{#if people.length > 0}
			<Button type="submit" form="invite-people" variant="primary">{s.send}</Button>
		{/if}
	{/snippet}
</Dialog>

<style>
	.none {
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
	}

	.people {
		display: grid;
		max-block-size: 40vh;
		margin: 0 calc(var(--gap-sm) * -1);
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	.person {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-block-size: 2.5rem;
		padding-inline: var(--gap-sm);
		border-radius: var(--radius-control);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		cursor: pointer;
	}

	.person:hover {
		background-color: var(--hue-hover);
	}

	.name {
		flex: 1;
	}

	input {
		accent-color: var(--hue-accent);
		inline-size: 1rem;
		block-size: 1rem;
	}
</style>
