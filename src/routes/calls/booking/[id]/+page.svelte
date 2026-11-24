<script lang="ts">
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { calcom } from '#lib/strings/calcom.js';
	import { calls } from '#lib/strings/calls.js';
	import { core } from '#lib/strings/core.js';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	const g = calcom.guest;
</script>

<svelte:head>
	<title>{data.title} · {core.appName}</title>
</svelte:head>

<PageHeader title={data.title} />

<!-- A booked call's door for guests, in the same shape as a call's lobby: the call's mark,
     when it is, then who you are, picked from the booking's guests. -->
<div class="booking">
	<span class="mark" data-open={data.lobby?.state === 'open' ? '' : undefined} aria-hidden="true">
		<Icon name="video-camera-filled" size={24} />
	</span>
	{#if !data.lobby}
		<p class="note" role="status">{calcom.booking.cancelled}</p>
	{:else}
		{@const lobby = data.lobby}
		<p class="when">{g.when(lobby.startsAt, lobby.endsAt, data.timeZone)}</p>
		{#if lobby.recorded && lobby.state === 'open'}
			<p class="consent" role="status">{calls.recording.consent}</p>
		{/if}
		{#if lobby.state !== 'open'}
			<p class="note" role="status">{g.closed[lobby.state]}</p>
		{:else if lobby.guests.length === 0}
			<p class="note" role="status">{g.noGuests}</p>
		{:else}
			<form method="POST" action="?/join">
				<input type="hidden" name="signature" value={lobby.signature} />
				<fieldset>
					<legend>{g.name}</legend>
					<p class="note">{g.intro}</p>
					<div class="guests">
						{#each lobby.guests as name, i (i)}
							<label class="guest">
								<Avatar {name} size="sm" />
								<span>{name}</span>
								<input
									type="radio"
									name="guest"
									value={i}
									required
									checked={lobby.guests.length === 1}
								/>
							</label>
						{/each}
					</div>
				</fieldset>
				<Button type="submit" variant="primary">
					<Icon name="video-camera" size={16} />{g.join}
				</Button>
			</form>
		{/if}
	{/if}
</div>

<style>
	.booking {
		display: flex;
		flex-direction: column;
		gap: var(--gap-md);
		align-items: center;
		max-inline-size: 30rem;
		margin-inline: auto;
		padding: var(--gap-3xl) var(--gap-lg);
		text-align: center;
	}

	.mark {
		display: grid;
		place-items: center;
		inline-size: 2.75rem;
		block-size: 2.75rem;
		border-radius: var(--radius-full);
		background-color: var(--hue-fill);
		color: var(--hue-text-quaternary);
	}

	.mark[data-open] {
		background-color: var(--hue-call-subtle);
		color: var(--hue-call);
	}

	.when,
	.consent {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: var(--fw-medium);
	}

	.note {
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		text-wrap: balance;
	}

	form {
		display: grid;
		gap: var(--gap-lg);
		justify-items: center;
		inline-size: 100%;
		margin-block-start: var(--gap-md);
	}

	fieldset {
		display: grid;
		gap: var(--gap-sm);
		inline-size: 100%;
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-block-end: var(--gap-xs);
		font-size: var(--type-body);
		font-weight: var(--fw-semibold);
	}

	.guests {
		display: grid;
		margin-block-start: var(--gap-sm);
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-surface);
		text-align: start;
	}

	.guest {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-block-size: 2.75rem;
		padding-inline: 0.75rem;
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		cursor: pointer;
	}

	.guest + .guest {
		border-block-start: var(--border-w-hairline) solid var(--hue-z0-border);
	}

	.guest span {
		flex: 1;
	}

	.guest input {
		accent-color: var(--hue-accent);
	}
</style>
