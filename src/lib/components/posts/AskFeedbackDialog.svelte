<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { posts } from '#lib/strings/posts.js';

	type Props = {
		/** People the post's author may ask: everyone else who can see the post. */
		candidates: { id: string; name: string }[];
		/** Opened from the post's "…" menu. */
		open: boolean;
	};

	let { candidates, open = $bindable() }: Props = $props();
	const s = posts.feedback;
</script>

<Dialog bind:open title={s.dialogTitle} description={s.dialogIntro}>
	{#if candidates.length === 0}
		<p class="none">{s.noOneToAsk}</p>
	{:else}
		<form
			id="ask-feedback"
			method="POST"
			action="?/requestFeedback"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					open = false;
				}}
		>
			<ul role="list" class="people">
				{#each candidates as person (person.id)}
					<li>
						<label class="person">
							<span aria-hidden="true"><Avatar name={person.name} size="sm" /></span>
							<span class="name">{person.name}</span>
							<input type="checkbox" name="person" value={person.id} />
						</label>
					</li>
				{/each}
			</ul>
		</form>
	{/if}
	{#snippet actions()}
		<Button onclick={() => (open = false)}>{s.cancel}</Button>
		{#if candidates.length > 0}
			<SuedeButton type="submit" form="ask-feedback">{s.send}</SuedeButton>
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
		min-block-size: var(--control-h-lg);
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
