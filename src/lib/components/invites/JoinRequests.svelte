<!--
@component
The Requests view under Members, for admins: one row per person who asked to join, newest
first, with Approve and Deny at the end. Deny waits 5 seconds with an Undo in the row before it
is sent (and the person emailed). Approve all sits above the list when more than three wait.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { slide } from 'svelte/transition';
	import FormStatus from '#lib/components/settings/FormStatus.svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import ListRow from '#lib/components/shell/ListRow.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { invites } from '#lib/strings/invites.js';
	import { notifications } from '#lib/strings/notifications.js';
	import { time } from '#lib/strings/time.js';

	type Request = {
		userId: string;
		name: string;
		email: string;
		avatarUrl: string | null;
		createdAt: number;
	};

	let { requests }: { requests: Request[] } = $props();
	const s = invites.requests;
	const undoMs = 5000;

	// What the last answer did, for the status line.
	let done = $state<string>();
	let failed = $state<string>();
	const answered: SubmitFunction =
		() =>
		async ({ result, update }) => {
			done = result.type === 'success' ? (result.data?.done as string) : undefined;
			failed = result.type === 'failure' ? (result.data?.message as string) : undefined;
			// The forms post to ?/action, which drops ?view=requests: stay on this view.
			await update({ navigate: false });
		};

	// A denial waits here for its undo window; the timer sends the row's deny form.
	const denyForms: Record<string, HTMLFormElement> = {};
	const denying = $state<Record<string, ReturnType<typeof setTimeout>>>({});

	function deny(event: MouseEvent, userId: string) {
		event.preventDefault();
		denying[userId] = setTimeout(() => send(userId), undoMs);
	}

	function undo(userId: string) {
		clearTimeout(denying[userId]);
		delete denying[userId];
	}

	function send(userId: string) {
		undo(userId);
		denyForms[userId].requestSubmit();
	}

	// Leaving the page sends what's waiting rather than dropping it.
	beforeNavigate(() => Object.keys(denying).forEach(send));

	// A row that leaves (approved, or denied once the undo has passed) closes up its height.
	function collapse(node: Element) {
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const base = parseFloat(getComputedStyle(node).getPropertyValue('--motion-base'));
		return slide(node, { duration: reduce ? 0 : base });
	}
</script>

{#if requests.length === 0}
	<EmptyState title={s.emptyTitle} description={s.emptyDescription}>
		{#snippet icon()}<Icon name="user-circle-plus" size={32} />{/snippet}
		{#snippet action()}
			<Button href={resolve('/settings/org')}>{s.domainSetting}</Button>
		{/snippet}
	</EmptyState>
{:else}
	{#if requests.length > 3}
		<form class="all" method="POST" action="?/approveAll" use:enhance={answered}>
			<Button type="submit">{s.approveAll}</Button>
		</form>
	{/if}
	<ul role="list" class="list">
		{#each requests as request (request.userId)}
			<li out:collapse>
				<ListRow>
					{#snippet leading()}
						<Avatar name={request.name} src={request.avatarUrl} size="sm" />
					{/snippet}
					{request.name}
					{#snippet description()}
						{request.userId in denying ? s.denying(request.name) : request.email}
					{/snippet}
					{#snippet meta()}
						<time
							datetime={new Date(request.createdAt).toISOString()}
							title={time.long(request.createdAt, page.data.timeZone)}
						>
							{s.asked(notifications.inbox.ago(request.createdAt))}
						</time>
						{#if request.userId in denying}
							<Button size="sm" variant="ghost" onclick={() => undo(request.userId)}>
								{s.undo}
							</Button>
						{:else}
							<form method="POST" action="?/approve" use:enhance={answered}>
								<input type="hidden" name="userId" value={request.userId} />
								<Button type="submit" size="sm">{s.approve}</Button>
							</form>
						{/if}
						<form
							method="POST"
							action="?/deny"
							use:enhance={answered}
							bind:this={denyForms[request.userId]}
							hidden={request.userId in denying}
						>
							<input type="hidden" name="userId" value={request.userId} />
							<Button
								type="submit"
								size="sm"
								variant="ghost"
								onclick={(event) => deny(event, request.userId)}
							>
								{s.deny}
							</Button>
						</form>
					{/snippet}
				</ListRow>
			</li>
		{/each}
	</ul>
{/if}
<div class="status">
	<FormStatus message={failed} saved={done} />
</div>

<style>
	.list {
		padding: 0;
		margin: 0;
	}

	.all {
		display: flex;
		justify-content: flex-end;
		padding: var(--gap-sm) var(--gap-lg);
	}

	.status {
		padding: var(--gap-sm) var(--gap-lg);
	}
</style>
