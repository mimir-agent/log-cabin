<!--
@component
The composer's project picker, after Campsite's PostComposerProjectPicker (CC BY-NC 4.0,
Campsite Software Co.): a small button naming the project, ⌘P or Ctrl+P to open it, a search
field over the list, a check on the picked project. Beside it, a warning when guests will see
the post.
-->
<script lang="ts">
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Popover from '#lib/components/ui/Popover.svelte';
	import { posts } from '#lib/strings/posts.js';

	type Project = { id: string; name: string; accessory: string | null };
	type Props = {
		projects: Project[];
		value: string;
		/** How many guests belong to the picked project. */
		guests: number;
		onchange: (id: string) => void;
	};

	const { projects, value, guests, onchange }: Props = $props();
	const s = posts.composer;

	let open = $state(false);
	let query = $state('');
	let list = $state<HTMLElement>();
	const picked = $derived(projects.find((p) => p.id === value));
	const shown = $derived(
		projects.filter((p) => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
	);

	function shortcut(event: KeyboardEvent) {
		if (event.key !== 'p' || !(event.metaKey || event.ctrlKey)) return;
		// Not the browser's print dialog.
		event.preventDefault();
		open = true;
	}

	function pick(id: string) {
		open = false;
		query = '';
		if (id !== value) onchange(id);
	}

	// Up and down move through the list, from the search field too.
	function move(event: KeyboardEvent) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		const items = [...(list?.querySelectorAll('button') ?? [])];
		const at = items.indexOf(document.activeElement as HTMLButtonElement);
		const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
		if (next < 0 || next >= items.length) return;
		event.preventDefault();
		items[next].focus();
	}
</script>

<svelte:window onkeydown={shortcut} />

<div class="picker">
	<Popover bind:open width="16rem" padding="none" label={s.changeProject}>
		{#snippet trigger({ props })}
			<Button {...props} size="sm" title="{s.changeProject} (⌘P)">
				<span class="mark" aria-hidden="true"
					><Avatar
						name={picked?.name ?? ''}
						accessory={picked?.accessory}
						size="xs"
						shape="square"
					/></span
				>
				<span class="name">{picked?.name}</span>
				<span class="chevron"><Icon name="chevron-down" size={16} /></span>
			</Button>
		{/snippet}
		<!-- The arrow keys move between the field and the rows. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="panel" onkeydown={move}>
			<label class="search">
				<Icon name="search" size={16} />
				<span class="u:visually-hidden">{s.searchProjects}</span>
				<input type="search" placeholder={s.searchProjects} autocomplete="off" bind:value={query} />
			</label>
			<ul bind:this={list}>
				{#each shown as project (project.id)}
					<li>
						<button
							type="button"
							class="item"
							aria-current={project.id === value || undefined}
							onclick={() => pick(project.id)}
						>
							<span class="mark" aria-hidden="true"
								><Avatar
									name={project.name}
									accessory={project.accessory}
									size="xs"
									shape="square"
								/></span
							>
							<span class="name">{project.name}</span>
							{#if project.id === value}
								<span class="check"><Icon name="check" size={16} /></span>
							{/if}
						</button>
					</li>
				{:else}
					<li class="none">{s.noProjects}</li>
				{/each}
			</ul>
		</div>
	</Popover>
	{#if guests > 0}<span class="guests">{s.guests(guests)}</span>{/if}
</div>

<style>
	.picker {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-inline-size: 0;
	}

	.chevron {
		display: flex;
		flex: none;
		color: var(--hue-z0-muted);
	}

	.name {
		max-inline-size: 16rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mark {
		display: flex;
		flex: none;
	}

	.search {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		padding: var(--gap-xs) 0.625rem 0;
		border-block-end: var(--border-w-hairline) solid var(--hue-z2-border);
		color: var(--hue-z0-muted);
	}

	.search input {
		flex: 1;
		min-inline-size: 0;
		block-size: 2rem;
		padding: 0;
		border: 0;
		background: none;
		color: var(--hue-z2-fg);
		font-size: max(var(--type-body), var(--type-control));
		outline: none;
	}

	ul {
		margin: 0;
		padding: var(--gap-xs);
		list-style: none;
	}

	/* Campsite's select item: 32px, 8px sides, 14px medium. */
	.item {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		inline-size: 100%;
		block-size: 2rem;
		padding-inline: var(--gap-sm);
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: inherit;
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		text-align: start;
		cursor: pointer;
	}

	.item:hover,
	.item:focus-visible {
		background-color: var(--hue-hover);
		outline: none;
	}

	.check {
		display: flex;
		margin-inline-start: auto;
	}

	.none {
		padding: var(--gap-sm);
		color: var(--hue-z0-muted);
	}

	/* Campsite's guest warning, beside the picker. */
	.guests {
		flex: none;
		color: var(--hue-warning);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
		line-height: var(--leading-ui);
	}
</style>
