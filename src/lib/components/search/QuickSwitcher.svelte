<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Command, Dialog } from 'bits-ui';
	import Marked from './Marked.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import type { IconName } from '#lib/components/ui/icons/campsite-icons.js';
	import { untitled, type SearchKind } from '#lib/search.js';
	import { search as strings } from '#lib/strings/search.js';

	type Hit = {
		kind: SearchKind;
		id: string;
		href: string;
		title: string;
		projectPrivate: boolean;
		projectArchived: boolean;
	};
	type Lists = { projects: Hit[]; hits: Hit[] };
	type Recent = { kind: 'post' | 'note'; id: string; href: string; title: string };

	const s = strings.quick;
	type Props = {
		/** Your projects, from the sidebar: matched as you type, before the server answers. */
		projects: { id: string; name: string; private: boolean }[];
		/** The people you can find, matched the same way. */
		people: { id: string; name: string }[];
		/** The posts and notes you can see that changed last: the empty box lists them, typing narrows them. */
		recent: Recent[];
	};
	let { projects, people: findable, recent }: Props = $props();
	let open = $state(false);
	let q = $state('');
	let lists: Lists = $state({ projects: [], hits: [] });
	let selected = $state('');
	let input: HTMLInputElement | undefined = $state();

	/** Each row leads with what it is, as Campsite's command menu does. */
	const kindIcon: Record<SearchKind, IconName> = {
		post: 'post',
		comment: 'chat-bubble',
		note: 'note',
		member: 'user',
		message: 'chat-bubble',
		project: 'project',
		call: 'video'
	};

	// The projects and recent items on hand match on every keystroke; the server's search,
	// which takes a round trip, adds its results when they come. It finds projects by their
	// description too, so its rows aren't narrowed by name here.
	const typed = $derived(q.trim().toLowerCase());
	const matches = (text: string) => text.toLowerCase().includes(typed);
	const projectMatches = $derived.by(() => {
		const local = typed
			? projects
					.filter((p) => matches(p.name) && !lists.projects.some((found) => found.id === p.id))
					.map((p) => ({
						id: p.id,
						href: resolve('/projects/[id]', { id: p.id }),
						title: p.name,
						locked: p.private,
						archived: false
					}))
			: [];
		const found = lists.projects.map((p) => ({
			id: p.id,
			href: p.href,
			title: p.title,
			locked: p.projectPrivate,
			archived: p.projectArchived
		}));
		return [...found, ...local];
	});
	const recentMatches = $derived(recent.filter((item) => matches(item.title)));
	const people = $derived.by(() => {
		const found = lists.hits.filter((hit) => hit.kind === 'member');
		const local = typed
			? findable
					.filter((p) => matches(p.name) && !found.some((hit) => hit.id === p.id))
					.map((p) => ({
						kind: 'member' as const,
						id: p.id,
						href: resolve('/members/[id]', { id: p.id }),
						title: p.name
					}))
			: [];
		return [...found, ...local];
	});
	const results = $derived(lists.hits.filter((hit) => hit.kind !== 'member'));

	/** The value of the row that renders first, in the order the groups are drawn below. */
	function firstValue(): string {
		return (
			recentMatches[0]?.href ??
			projectMatches[0]?.href ??
			people[0]?.href ??
			results[0]?.href ??
			(typed ? 'search' : '')
		);
	}

	function onkeydown(event: KeyboardEvent) {
		// An editor that took Ctrl/⌘+K for its link field has already handled it.
		if (event.defaultPrevented) return;
		if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			open = !open;
		}
	}

	// Each change of the text asks the server again; a newer request cancels the older one.
	// The empty box asks nothing: it lists the recent items on hand.
	// New rows replace the old ones under the pointer: start again from the first, so Enter
	// always has something to open, as in Campsite's command menu.
	$effect(() => {
		if (!open) return;
		untrack(() => (selected = firstValue()));
		if (!q.trim()) {
			lists = { projects: [], hits: [] };
			return;
		}
		const controller = new AbortController();
		const url = `${resolve('/search/quick')}?${new URLSearchParams({ q })}`;
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(url, { signal: controller.signal });
				if (!response.ok) throw new Error(`quick switcher: GET ${url} answered ${response.status}`);
				lists = await response.json();
				selected = firstValue();
			} catch (e) {
				// A newer request replaced this one; anything else is a real failure.
				if (!controller.signal.aborted) throw e;
			}
		}, 120);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	function go(href: string) {
		open = false;
		q = '';
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- every href is an app path
		goto(href);
	}
</script>

<svelte:window {onkeydown} />

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay>
			{#snippet child({ props })}<div {...props} class="overlay"></div>{/snippet}
		</Dialog.Overlay>
		<Dialog.Content
			aria-label={s.label}
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				input?.focus();
			}}
		>
			{#snippet child({ props })}
				<div {...props} class="switcher">
					<Command.Root shouldFilter={false} label={s.label} bind:value={selected}>
						<Command.Input placeholder={s.placeholder}>
							{#snippet child({ props })}<input
									{...props}
									class="input"
									bind:value={q}
									bind:this={input}
								/>{/snippet}
						</Command.Input>
						<Command.List>
							{#snippet child({ props })}
								<div {...props} class="list">
									<Command.Viewport>
										{@render group(
											s.recent,
											recentMatches.map((r) => ({ ...r, icon: kindIcon[r.kind] }))
										)}
										{@render group(
											s.projects,
											projectMatches.map((p) => ({ ...p, icon: 'project' as const }))
										)}
										{@render group(
											s.people,
											people.map((hit) => ({ ...hit, icon: kindIcon[hit.kind] }))
										)}
										{@render group(
											s.results,
											results.map((hit) => ({
												...hit,
												title: hit.title || untitled(hit.kind),
												icon: kindIcon[hit.kind]
											}))
										)}
										{#if q.trim()}
											<Command.Item
												value="search"
												onSelect={() => go(`${resolve('/search')}?${new URLSearchParams({ q })}`)}
											>
												{#snippet child({ props })}
													<div {...props} class="item">
														<Icon name="search" />
														<span class="title">{s.searchFor(q.trim())}</span>
													</div>
												{/snippet}
											</Command.Item>
										{/if}
									</Command.Viewport>
								</div>
							{/snippet}
						</Command.List>
					</Command.Root>
				</div>
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

{#snippet group(
	heading: string,
	items: {
		id: string;
		href: string;
		title: string;
		icon: IconName;
		locked?: boolean;
		archived?: boolean;
	}[]
)}
	{#if items.length}
		<Command.Group>
			<Command.GroupHeading>
				{#snippet child({ props })}<div {...props} class="heading">{heading}</div>{/snippet}
			</Command.GroupHeading>
			<Command.GroupItems>
				{#each items as item (item.href)}
					<Command.Item value={item.href} onSelect={() => go(item.href)}>
						{#snippet child({ props })}
							<div {...props} class="item">
								<Icon name={item.icon} />
								<span class="title"><Marked text={item.title || strings.page.untitled} /></span>
								{#if item.locked}<span class="lock"><Icon name="lock" size={16} /></span>{/if}
								{#if item.archived}<small>{strings.page.archived}</small>{/if}
							</div>
						{/snippet}
					</Command.Item>
				{/each}
			</Command.GroupItems>
		</Command.Group>
	{/if}
{/snippet}

<style>
	/* Campsite's command menu (apps/web/components/CommandMenu, packages/ui/src/Command; CC
	   BY-NC 4.0): 768px wide and 64px from the top, the field and the list in one sheet with
	   no line between them, 40px rows at 15px, a barely-there backdrop. */
	.overlay {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal);
		background-color: var(--hue-backdrop-faint);
		transition: opacity var(--motion-fast) var(--motion-ease-out);

		@starting-style {
			opacity: 0;
		}
	}

	.switcher {
		position: fixed;
		inset-block-start: 4rem;
		inset-inline: 0;
		z-index: var(--z-modal);
		display: flex;
		flex-direction: column;
		inline-size: min(48rem, calc(100% - 2 * var(--gap-sm)));
		max-block-size: min(28.375rem, calc(100dvh - 5rem));
		margin-inline: auto;
		border-radius: var(--radius-surface);
		background-color: var(--hue-z2-bg);
		color: var(--hue-z2-fg);
		box-shadow: var(--elevation-dialog);
		overflow: hidden;
		transition: opacity var(--motion-fast) var(--motion-ease-out);

		@starting-style {
			opacity: 0;
		}
	}

	.switcher :global([data-command-root]) {
		display: flex;
		flex-direction: column;
		min-block-size: 0;
	}

	.input {
		flex: none;
		inline-size: 100%;
		min-block-size: 0;
		padding: 0.75rem var(--gap-lg);
		border: 0;
		border-radius: 0;
		background: transparent;
		color: inherit;
		/* 15px, or 16 where a phone would zoom into anything smaller. */
		font-size: max(0.9375rem, var(--type-control));
		line-height: 1.5;
		outline: none;
	}

	.list {
		min-block-size: 0;
		overflow-y: auto;
		padding: 0 var(--gap-sm) var(--gap-sm);
		scroll-padding-block-end: var(--gap-sm);
		scrollbar-width: none;
	}

	.heading {
		display: flex;
		align-items: center;
		block-size: var(--control-h-lg);
		padding-inline: var(--gap-sm);
		color: var(--hue-text-secondary);
		font-size: var(--type-caption);
	}

	.item {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		block-size: var(--control-h-lg);
		padding-inline: var(--gap-sm);
		border-radius: var(--radius-surface);
		font-size: 0.9375rem;
		line-height: var(--leading-tight);
		cursor: pointer;
		user-select: none;
		scroll-margin: var(--gap-xs);
		transition:
			background-color 150ms var(--motion-ease-out),
			box-shadow 150ms var(--motion-ease-out);
	}

	.item > :global(.icon) {
		flex: none;
	}

	.title {
		min-inline-size: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* A private project's lock and an archived one's note, quieter than the name. */
	.lock {
		display: inline-flex;
		flex: none;
		color: var(--hue-text-quaternary);
	}

	.item small {
		flex: none;
		color: var(--hue-z2-muted);
		font-size: var(--type-caption);
	}

	.item[data-selected] {
		background-color: var(--hue-menu-highlight);
		box-shadow: var(--shadow-select-item);
	}

	/* On a touchscreen the row under the thumb is the selection; nothing stays lit. */
	@media (hover: none) and (pointer: coarse) {
		.item[data-selected] {
			background-color: transparent;
			box-shadow: none;
		}

		.item:active {
			background-color: var(--hue-menu-highlight);
		}
	}
</style>
