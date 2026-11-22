<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import JoinRequests from '#lib/components/invites/JoinRequests.svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Badge from '#lib/components/shell/Badge.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import ListRow from '#lib/components/shell/ListRow.svelte';
	import PageColumns from '#lib/components/shell/PageColumns.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import SegmentedControl from '#lib/components/ui/SegmentedControl.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import StatusLine from '#lib/components/people/StatusLine.svelte';
	import { isActive } from '#lib/people/seen.js';
	import { auth } from '#lib/strings/auth.js';
	import { core } from '#lib/strings/core.js';
	import { invites } from '#lib/strings/invites.js';
	import { people } from '#lib/strings/people.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const s = auth.members;
	const views = $derived([
		{ value: 'members' as const, label: s.title },
		{ value: 'requests' as const, label: invites.requests.nav, count: data.requests.length }
	]);
	function show(view: 'members' | 'requests') {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the path is resolved; ?view is its query
		if (view === 'requests') goto(`${resolve('/members')}?view=requests`);
		else goto(resolve('/members'));
	}
</script>

<svelte:head>
	<title>{s.title} · {core.appName}</title>
</svelte:head>

<PageHeader title={s.title}>
	{#snippet actions()}
		{#if data.isAdmin}
			<Button href={resolve('/settings/invites')} variant="primary">{s.invite}</Button>
		{/if}
	{/snippet}
</PageHeader>

<PageColumns>
	{#if data.isAdmin}
		<div class="views">
			<SegmentedControl
				label={invites.requests.views}
				value={data.view}
				options={views}
				onValueChange={show}
			/>
		</div>
	{/if}
	{#if data.view === 'requests'}
		<JoinRequests requests={data.requests} />
	{:else}
		<form method="GET" role="search" class="search">
			<label>
				<span class="u:visually-hidden">{s.search}</span>
				<input name="q" type="search" placeholder={s.search} value={data.query} />
			</label>
		</form>
		{#if data.members.length === 0}
			<EmptyState title={s.empty} />
		{:else}
			<ul role="list" class="list">
				{#each data.members as member (member.id)}
					{@const active = isActive(member.lastSeenAt, Date.now())}
					<li>
						<ListRow href={resolve('/people/[username]', { username: member.username })}>
							{#snippet leading()}
								<Avatar
									name={member.name}
									src={member.avatarUrl}
									presence={active ? 'online' : null}
									presenceLabel={active ? people.seen.activeNow : undefined}
								/>
							{/snippet}
							{member.name}
							{#snippet description()}
								{#if member.status}<StatusLine status={member.status} />{/if}
							{/snippet}
							{#snippet meta()}
								{core.roles[member.role]}
								{#if member.deactivatedAt}<Badge>{s.deactivated}</Badge>{/if}
							{/snippet}
						</ListRow>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</PageColumns>

<style>
	.views {
		padding: var(--gap-md) var(--gap-lg) 0;
	}

	.search {
		padding: var(--gap-md) var(--gap-lg);
	}

	.list {
		padding: 0;
		margin: 0;
	}
</style>
