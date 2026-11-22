<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import CallRoom, { type CallPerson } from '#lib/components/calls/CallRoom.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { CallConnection } from '#lib/calls/connection.js';
	import { afterFailedBeat } from '#lib/calls/guest-heartbeat.js';
	import { calcom } from '#lib/strings/calcom.js';
	import { calls } from '#lib/strings/calls.js';
	import { core } from '#lib/strings/core.js';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	const g = calcom.guest;
	let connection = $state<CallConnection | null>(null);
	/** Who's in the call, from the page's load or, once joined, from the last heartbeat. */
	let heard = $state<CallPerson[] | null>(null);
	const people = $derived(heard ?? data.call.participants);
	/** The server no longer counts this guest in the call: the pass ran out, or they were gone too long. */
	let removed = $state(false);
	/** Why the heartbeat stopped, when the server answered it with something unexpected. The
	 *  room shows it with its own failures, on the call's screen while connected. */
	let problem = $state('');

	// A guest has no realtime socket, so their page tells the server it's still here and
	// hears who else is, every 5 seconds.
	$effect(() => {
		const joined = connection;
		if (!joined) return;
		const timer = setInterval(async () => {
			try {
				heard = (await joined.ping<CallPerson>()).participants;
			} catch (e) {
				const next = afterFailedBeat(e);
				if (next === 'retry') return;
				clearInterval(timer);
				if (next === 'ended') await refresh();
				if (next === 'removed') removed = true;
				if (next === 'failed') problem = calls.room.failed((e as Error).message);
			}
		}, 5_000);
		return () => clearInterval(timer);
	});

	async function refresh() {
		heard = null;
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>{data.title} · {core.appName}</title>
</svelte:head>

<PageHeader title={data.title} />

{#if removed}
	<div>
		<EmptyState title={g.removed}>
			{#snippet icon()}<Icon name="video-camera-off" size={32} />{/snippet}
		</EmptyState>
	</div>
{:else}
	<CallRoom
		callId={data.call.id}
		title={data.title}
		{people}
		ended={data.call.ended}
		canShare={false}
		{refresh}
		bind:connection
		bind:problem
	>
		{#snippet intro()}{g.joiningAs(data.name)}{/snippet}
	</CallRoom>
{/if}
