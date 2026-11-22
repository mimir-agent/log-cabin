<script lang="ts">
	import { enhance } from '$app/forms';
	import EmptyState from '#lib/components/shell/EmptyState.svelte';
	import ListRow from '#lib/components/shell/ListRow.svelte';
	import PageColumns from '#lib/components/shell/PageColumns.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import RemindMe from '#lib/components/posts/RemindMe.svelte';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	const s = posts.followUps;
</script>

<svelte:head>
	<title>{s.pageTitle} · {core.appName}</title>
</svelte:head>

<PageHeader title={s.pageTitle}>
	{#snippet description()}{s.pageIntro}{/snippet}
</PageHeader>

<PageColumns>
	{#if data.reminders.length === 0}
		<EmptyState title={s.empty} />
	{:else}
		<ul role="list" class="list">
			{#each data.reminders as reminder (reminder.id)}
				<li class="item">
					<div class="grow">
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<ListRow href={reminder.url}>
							{reminder.title}
							{#snippet description()}{s.subjects[reminder.subjectType]}{/snippet}
							{#snippet meta()}
								{s.due}
								<time
									datetime={new Date(reminder.showAt).toISOString()}
									title={s.exactTime(reminder.showAt, data.timeZone)}
									>{posts.post.when(reminder.showAt, data.timeZone)}</time
								>
							{/snippet}
						</ListRow>
					</div>
					<div class="actions">
						<RemindMe
							action="?/snooze"
							fields={{ id: reminder.id }}
							label={s.change}
							variant="secondary"
						/>
						<form method="POST" action="?/finish" use:enhance>
							<input type="hidden" name="id" value={reminder.id} />
							<Button type="submit">{s.remove}</Button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</PageColumns>

<style>
	.list {
		margin: 0;
		padding: 0;
	}

	.item {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
		align-items: center;
		padding-inline-end: var(--gap-lg);
		border-block-end: var(--border-w-thin) solid var(--hue-z0-border);
	}

	.grow {
		flex: 1 1 24rem;
		min-inline-size: 0;
	}

	.actions {
		display: flex;
		gap: var(--gap-sm);
		margin-inline-start: auto;
		padding-block: var(--gap-sm);
	}
</style>
