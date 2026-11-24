<script lang="ts">
	import FacePile from '#lib/components/ui/FacePile.svelte';
	import type { NoteConnection, LiveStatus } from '#lib/notes/connection.js';
	import type { LiveUser } from '#lib/notes/live.js';
	import { notes } from '#lib/strings/notes.js';

	type Props = {
		live: NoteConnection;
		status: LiveStatus;
		/** faces: who has the note open, for the titlebar. status: the connection, for the page. */
		display?: 'faces' | 'status';
	};

	const { live, status, display = 'status' }: Props = $props();
	const s = notes.live;

	/** Everyone with the note open, once each however many tabs they have. */
	function people(): LiveUser[] {
		const byId: Record<string, LiveUser> = {};
		for (const state of live.awareness.getStates().values()) {
			const user = state.user as LiveUser | undefined;
			if (user) byId[user.id] = user;
		}
		return Object.values(byId);
	}

	let here = $state<LiveUser[]>([]);
	$effect(() => {
		const update = () => (here = people());
		update();
		live.awareness.on('change', update);
		return () => live.awareness.off('change', update);
	});

	// Trouble is said out loud; a healthy connection is only announced to screen readers.
	const trouble = $derived(status === 'offline' || status === 'closed');
</script>

{#if display === 'faces'}
	<FacePile
		people={here.map((p) => ({
			id: p.id,
			name: p.id === live.user.id ? s.you(p.name) : p.name,
			hue: p.hue
		}))}
		limit={4}
		size="sm"
		label={s.here}
	/>
{:else}
	<p class={trouble ? 'status' : 'u:visually-hidden'} role="status" data-status={status}>
		{s.status[status]}
	</p>
{/if}

<style>
	.status {
		margin: 0;
		padding: var(--gap-sm) var(--gap-md);
		border-radius: var(--radius-control);
		background-color: var(--hue-danger-subtle);
		color: var(--hue-danger);
		font-size: var(--type-body);
	}
</style>
