<script lang="ts">
	import { enhance } from '$app/forms';
	import { pushState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { notes } from '#lib/strings/notes.js';

	type Permission = 'view' | 'edit';
	type Props = {
		shares: { userId: string; name: string; permission: Permission }[];
		candidates: { id: string; name: string }[];
		projects: { id: string; name: string }[];
		project: { id: string | null; permission: 'none' | Permission };
		/** Guests share only with their projects. */
		canShareWithPeople: boolean;
		/** Their own share, which they can't change from here. */
		viewerId: string;
		/** The doc itself, to share as a post. */
		noteId: string;
		noteTitle: string;
		/** Called once the post dialog is open, so the popover can close. */
		onsharepost: () => void;
	};

	const {
		shares,
		candidates,
		projects,
		project,
		canShareWithPeople,
		viewerId,
		noteId,
		noteTitle,
		onsharepost
	}: Props = $props();
	const s = notes.sharing;
	const permissions = ['view', 'edit'] as const;

	// The doc's channel, or else the first one, which the dialog opens its picker over.
	const postChannel = $derived(project.id ?? projects[0]?.id);

	function sharePost(channelId: string) {
		pushState(resolve('/projects/[id]/new', { id: channelId }), {
			newPost: channelId,
			shareDoc: { id: noteId, title: noteTitle, inChannel: project.id !== null }
		});
		onsharepost();
	}
</script>

<section class="sharing l:waterfall" aria-labelledby="sharing-title">
	{#if postChannel}
		<div class="post">
			<span class="icon"><Icon name="paper-airplane" /></span>
			<div class="words">
				<h2 class="title">{notes.sharePost.title}</h2>
				<p class="muted">{notes.sharePost.line}</p>
			</div>
			<span class="action">
				<Button size="sm" onclick={() => sharePost(postChannel)}>{notes.sharePost.button}</Button>
			</span>
		</div>
	{/if}
	<h2 id="sharing-title" class="title">{s.title}</h2>

	<h3>{s.people}</h3>
	{#if shares.length === 0}
		<p class="muted">{s.nobody}</p>
	{:else}
		<ul class="shares" role="list">
			{#each shares as share (share.userId)}
				<li>
					{#if canShareWithPeople && share.userId !== viewerId}
						<form method="POST" action="?/share" class="row" use:enhance>
							<span>{share.name}</span>
							<input type="hidden" name="userId" value={share.userId} />
							<select
								name="permission"
								aria-label={s.permissionFor(share.name)}
								value={share.permission}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
							>
								{#each permissions as p (p)}<option value={p}>{s.permission[p]}</option>{/each}
							</select>
						</form>
					{:else}
						<span>{share.name} · {s.permission[share.permission]}</span>
					{/if}
					<form method="POST" action="?/unshare" use:enhance>
						<input type="hidden" name="userId" value={share.userId} />
						<button class="quiet">{s.remove(share.name)}</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
	{#if canShareWithPeople && candidates.length > 0}
		<form method="POST" action="?/share" class="l:waterfall" use:enhance>
			<fieldset>
				<legend>{s.addPerson}</legend>
				<ul role="list" class="people">
					{#each candidates as person (person.id)}
						<li>
							<label class="person">
								<input type="checkbox" name="userId" value={person.id} />
								<span>{person.name}</span>
							</label>
						</li>
					{/each}
				</ul>
			</fieldset>
			<div class="row">
				<select name="permission" aria-label={s.permissionLabel}>
					{#each permissions as p (p)}<option value={p}>{s.permission[p]}</option>{/each}
				</select>
				<SuedeButton type="submit">{s.addPersonSubmit}</SuedeButton>
			</div>
		</form>
	{:else if !canShareWithPeople}
		<p class="muted">{s.guestsShareByProject}</p>
	{/if}

	<h3>{s.project}</h3>
	<form method="POST" action="?/shareProject" class="row" use:enhance>
		<select name="projectId" aria-label={s.project} value={project.id ?? ''}>
			<option value="">{s.noProject}</option>
			{#each projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
		</select>
		<select
			name="permission"
			aria-label={s.permissionLabel}
			value={project.permission === 'none' ? 'view' : project.permission}
		>
			{#each permissions as p (p)}<option value={p}>{s.permission[p]}</option>{/each}
		</select>
		<SuedeButton type="submit">{s.saveProject}</SuedeButton>
	</form>
</section>

<style>
	/* The loud door above the quiet ones: icon and words, then the button under the words. */
	.post {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--gap-xs) var(--gap-sm);
		align-items: start;
		padding-block-end: var(--gap-md);
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
	}

	.post .icon {
		display: flex;
		color: var(--hue-z0-muted);
	}

	.post .words p {
		margin: 0;
		font-size: var(--type-caption);
	}

	.post .action {
		grid-column: 2;
		justify-self: start;
	}

	.sharing {
		--waterfall-gap: var(--gap-sm);
	}

	/* Inside the Share popover: a 14px semibold heading, 13px section labels, 30px controls. */
	.title {
		margin: 0;
		font-size: var(--type-body);
		font-weight: var(--fw-semibold);
	}

	h3 {
		margin: var(--gap-xs) 0 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
	}

	.shares,
	.people,
	fieldset,
	legend {
		margin: 0;
		padding: 0;
		border: 0;
		list-style: none;
	}

	.shares li,
	.row,
	.person {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
		align-items: center;
	}

	/* The people not yet shared with, ticked to share with several at once. */
	.people {
		max-block-size: 40vh;
		overflow-y: auto;
	}

	.person {
		min-block-size: var(--control-h-sm);
		cursor: pointer;
	}

	.person input {
		accent-color: var(--hue-accent);
	}

	select {
		block-size: var(--control-h-sm);
		min-inline-size: 0;
		max-inline-size: 100%;
		padding-inline: var(--gap-sm);
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-control);
		background-color: var(--hue-z0-bg);
		color: inherit;
		font: inherit;
		font-size: var(--type-control);
	}

	.quiet {
		padding: 0;
		border: 0;
		background: none;
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		cursor: pointer;
	}

	.quiet:hover {
		color: var(--hue-z0-fg);
	}

	.muted {
		color: var(--hue-z0-muted);
	}
</style>
