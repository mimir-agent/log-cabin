<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CallRoom from '#lib/components/calls/CallRoom.svelte';
	import EndedCall from '#lib/components/calls/EndedCall.svelte';
	import InviteDialog from '#lib/components/calls/InviteDialog.svelte';
	import ShareDialog from '#lib/components/calls/ShareDialog.svelte';
	import RecordingBar from '#lib/components/calls/RecordingBar.svelte';
	import RecordingsMenu from '#lib/components/calls/RecordingsMenu.svelte';
	import RecordingList from '#lib/components/calls/RecordingList.svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Crumb from '#lib/components/shell/Crumb.svelte';
	import PinButton from '#lib/components/posts/PinButton.svelte';
	import PageColumns from '#lib/components/shell/PageColumns.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import PageIcon from '#lib/components/shell/PageIcon.svelte';
	import RemindMe from '#lib/components/posts/RemindMe.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { CallConnection } from '#lib/calls/connection.js';
	import { subscribe } from '#lib/realtime.js';
	import { calls } from '#lib/strings/calls.js';
	import { calcom } from '#lib/strings/calcom.js';
	import { core } from '#lib/strings/core.js';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	const s = calls.room;
	const people = $derived(data.call.participants);
	let connection = $state<CallConnection | null>(null);
	let problem = $state('');
	// A call that ended while this person was in it stays on the call's screen until they are out.
	const past = $derived(connection ? null : data.past);
	const title = $derived(
		past ? (data.recording.title ?? s.title(data.place.name)) : s.title(data.place.name)
	);

	function failed(e: unknown) {
		problem = s.failed(e instanceof Error ? e.message : String(e));
	}

	// Only the id: an effect reading data would leave and rejoin the topic on every reload,
	// and while it's away the server counts this person gone from the call.
	const callId = $derived(data.call.id);
	$effect(() =>
		subscribe(`call:${callId}`, (payload) => {
			if (payload.type !== 'denied') invalidate('call:room');
		})
	);
</script>

<svelte:head>
	<title>{title} · {core.appName}</title>
</svelte:head>

{#snippet endForEveryone()}
	{#if data.canEnd && !data.call.ended}
		<form method="POST" action="?/end" use:enhance>
			<Button type="submit" variant="ghost" size="sm">{s.end}</Button>
		</form>
	{/if}
{/snippet}

<PageHeader {title} back={data.place.href}>
	{#snippet leading()}
		<Crumb href={resolve('/calls')} label={calls.index.title}>
			{#snippet mark()}<PageIcon tone="call" />{/snippet}
		</Crumb>
	{/snippet}
	{#snippet description()}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the server builds the place's path -->
		<a class="place" href={data.place.href}>{data.place.name}</a>{#if !past}
			· {s.participants(people.length)}{/if}
	{/snippet}
	{#snippet actions()}
		{#if data.pin}
			<PinButton pin={data.pin} subjectType="call" subjectId={data.call.id} />
		{/if}
		<RemindMe
			action="/follow-ups?/set"
			fields={{ subjectType: 'call', subjectId: data.call.id }}
			reminder={data.followUps[data.call.id]}
			size="sm"
		/>
		{#if data.channels}
			<ShareDialog channels={data.channels} share={data.share} />
		{/if}
		{@render endForEveryone()}
		{#if data.canEnd && data.call.ended && data.recording.recordings.length && data.recording.recordings.every((r) => r.status !== 'processing')}
			<RecordingsMenu />
		{/if}
	{/snippet}
</PageHeader>

{#snippet invited()}
	{#if data.invitations.length > 0 && !data.call.ended}
		<ul class="invitations" role="list" aria-label={calls.ringing.invited}>
			{#each data.invitations as invitation (invitation.inviteeId)}
				<li>{invitation.name} · {calls.ringing.status[invitation.status]}</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet inCall()}
	<ul class="people" role="list">
		{#each people as person (person.id)}
			<li>
				<Avatar name={person.name} size="sm" />
				<span class="name"
					>{person.id === connection?.participantId ? s.you(person.name) : person.name}</span
				>
				{#if person.muted}
					<span class="muted" role="img" aria-label={s.muted}
						><Icon name="microphone-mute" size={16} /></span
					>
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}
{#snippet bookingNote()}
	{#if data.booking}
		<section class="booking" aria-label={calcom.booking.title}>
			<h2>{data.booking.title}</h2>
			<p>{calcom.booking.attendees(data.booking.attendees)}</p>
		</section>
	{/if}
{/snippet}

{#if past}
	<PageColumns>
		{@render bookingNote()}
		<EndedCall
			callId={data.call.id}
			{title}
			startedAt={past.startedAt}
			durationMs={past.durationMs}
			names={past.names}
			recording={data.recording}
		/>
	</PageColumns>
{:else}
	<!-- The rail lists who is in the call; with nobody in it there is no rail. -->
	<PageColumns
		railLabel={s.participants(people.length)}
		rail={people.length > 0 ? inCall : undefined}
	>
		{@render bookingNote()}
		{#if !connection && data.recording.active}
			<div class="recording-bar">
				<RecordingBar callId={data.call.id} view={data.recording} onerror={failed} />
			</div>
		{/if}
		<!-- Answering a ring brings the person here with ?join: they meant to be in the call. -->
		<CallRoom
			callId={data.call.id}
			{title}
			{people}
			ended={data.call.ended}
			recorded={!!data.recording.active}
			autoJoin={page.url.searchParams.has('join')}
			refresh={() => invalidate('call:room')}
			bind:connection
			bind:problem
		>
			{#snippet extras()}
				<InviteDialog people={data.invitable} />
				{@render endForEveryone()}
				{@render invited()}
			{/snippet}
			{#snippet recording({ stage, audio })}
				<RecordingBar
					callId={data.call.id}
					view={data.recording}
					{stage}
					{audio}
					onerror={failed}
				/>
			{/snippet}
		</CallRoom>
		{#if data.recording.recordings.length}
			<div class="recordings">
				<RecordingList callId={data.call.id} view={data.recording} />
			</div>
		{/if}
	</PageColumns>
{/if}

<style>
	.booking {
		padding: var(--gap-lg) var(--gap-lg) 0;
		text-align: center;
	}

	.recording-bar,
	.recordings {
		padding: var(--gap-lg) var(--gap-lg) 0;
	}

	.place {
		color: inherit;
		text-decoration: none;
	}

	.place:hover {
		color: var(--hue-z0-fg);
	}

	.booking h2 {
		margin: 0;
		font-size: var(--type-title);
		font-weight: var(--fw-semibold);
	}

	.booking p {
		margin: var(--gap-xs) 0 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
	}

	.invitations {
		display: flex;
		gap: var(--gap-md);
		margin: 0;
		padding: 0 var(--gap-sm);
		color: var(--hue-text-quaternary);
		font-size: var(--type-body);
		list-style: none;
	}

	/* Campsite's rail rows: a 24px face and the name at 14px medium. */
	.people {
		display: grid;
		gap: 0.125rem;
		margin: 0;
		padding: var(--gap-sm);
		list-style: none;
	}

	.people li {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-block-size: 2rem;
		padding-inline: var(--gap-sm);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
	}

	.name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.muted {
		display: inline-flex;
		color: var(--hue-text-quaternary);
	}
</style>
