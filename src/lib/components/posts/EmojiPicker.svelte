<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { Toolbar as BitsToolbar } from 'bits-ui';
	import Toolbar from '#lib/components/shell/Toolbar.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import type { PickerEmoji, PickerSection } from '#lib/emoji/data.js';
	import {
		countUse,
		frequentlyUsed,
		savedSkinTone,
		savedPickCounts,
		search,
		withSkinTone,
		type OrgEmoji
	} from '#lib/emoji/picker.js';
	import { posts } from '#lib/strings/posts.js';
	import EmojiPickerFooter from './EmojiPickerFooter.svelte';

	type Props = {
		onPick: (emoji: string) => void;
		orgEmoji: OrgEmoji;
	};

	const { onPick, orgEmoji }: Props = $props();
	const s = posts.picker;
	const columns = 9;

	let unicode = $state<PickerSection[] | null>(null);
	let query = $state('');
	let tone = $state(0);
	let pickCounts = $state<Record<string, number>>({});
	let focused = $state(0);
	let preview = $state<PickerEmoji | null>(null);
	let current = $state('frequent');
	let scroller = $state<HTMLElement>();
	// Enter in the search before the emoji have loaded picks the first match once they have.
	let pickWhenLoaded = false;

	onMount(async () => {
		tone = savedSkinTone();
		pickCounts = savedPickCounts();
		unicode = (await import('#lib/emoji/data.js')).unicodeSections;
		if (pickWhenLoaded && flat[0]) pick(flat[0]);
	});

	const custom = $derived<PickerSection>({
		id: 'custom',
		title: orgEmoji.orgName,
		items: Object.entries(orgEmoji.custom).map(([name, url]) => ({
			value: `:${name}:`,
			name,
			skinTones: false,
			terms: name,
			url
		}))
	});
	const sections = $derived.by(() => {
		if (!unicode) return [];
		const all = [custom, ...unicode];
		const byValue = new Map(all.flatMap((sec) => sec.items.map((e) => [e.value, e] as const)));
		const frequent = {
			id: 'frequent',
			title: s.frequent,
			items: frequentlyUsed(byValue, pickCounts)
		};
		if (query.trim()) return [{ id: 'results', title: s.search, items: search(all, query) }];
		return [frequent, ...all].filter((sec) => sec.items.length > 0);
	});
	const flat = $derived(sections.flatMap((sec) => sec.items));
	const shown = $derived(preview ?? flat[focused] ?? null);

	function pick(emoji: PickerEmoji) {
		countUse(emoji.value);
		onPick(withSkinTone(emoji, tone));
	}

	async function focusCell(index: number) {
		focused = Math.max(0, Math.min(flat.length - 1, index));
		await tick();
		scroller?.querySelector<HTMLElement>(`[data-index="${focused}"]`)?.focus();
	}

	const moves: Record<string, number> = {
		ArrowLeft: -1,
		ArrowRight: 1,
		ArrowUp: -columns,
		ArrowDown: columns
	};
	function onGridKey(event: KeyboardEvent) {
		if (event.key in moves) focusCell(focused + moves[event.key]);
		else if (event.key === 'Home') focusCell(0);
		else if (event.key === 'End') focusCell(flat.length - 1);
		else return;
		event.preventDefault();
	}

	function onSearchKey(event: KeyboardEvent) {
		if (event.key === 'Enter' && !unicode) pickWhenLoaded = true;
		else if (event.key === 'Enter' && flat[0]) pick(flat[0]);
		else if (event.key === 'ArrowDown') focusCell(0);
		else return;
		event.preventDefault();
	}

	function onScroll() {
		const headings = scroller?.querySelectorAll<HTMLElement>('[data-section]') ?? [];
		for (const h of headings)
			if (h.offsetTop <= scroller!.scrollTop + 8) current = h.dataset.section!;
	}

	function jump(id: string) {
		scroller?.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ block: 'start' });
		current = id;
	}

	const indexOf = (sectionIndex: number, i: number) =>
		sections.slice(0, sectionIndex).reduce((n, sec) => n + sec.items.length, 0) + i;
</script>

<div class="picker">
	<!-- svelte-ignore a11y_autofocus -->
	<input
		bind:value={query}
		class="search"
		type="search"
		placeholder={s.search}
		aria-label={s.search}
		autofocus
		oninput={() => (focused = 0)}
		onkeydown={onSearchKey}
	/>
	{#if !query.trim() && unicode}
		<div class="tabs">
			<Toolbar label={s.label}>
				{#each sections as sec (sec.id)}
					<BitsToolbar.Button onclick={() => jump(sec.id)}>
						{#snippet child({ props })}
							<button
								{...props}
								class="tab"
								title={sec.title}
								aria-label={sec.title}
								aria-current={current === sec.id}>{s.tabs[sec.id]}</button
							>
						{/snippet}
					</BitsToolbar.Button>
				{/each}
			</Toolbar>
		</div>
	{/if}
	<div
		class="scroller"
		bind:this={scroller}
		onscroll={onScroll}
		onkeydown={onGridKey}
		role="presentation"
	>
		{#if !unicode}
			<Spinner label={s.loading} />
		{:else if flat.length === 0}
			<p class="empty">
				{s.noMatch}
				{#if orgEmoji.canAdd}<a href={resolve('/settings/emoji')}>{s.addCustom}</a>{/if}
			</p>
		{/if}
		{#each sections as sec, si (sec.id)}
			<h3 class="heading" id="emoji-{sec.id}" data-section={sec.id}>{sec.title}</h3>
			<div class="grid" role="grid" aria-labelledby="emoji-{sec.id}">
				{#each { length: Math.ceil(sec.items.length / columns) }, row (row)}
					<div class="row" role="row">
						{#each sec.items.slice(row * columns, row * columns + columns) as emoji, ci (emoji.value)}
							{@const i = indexOf(si, row * columns + ci)}
							<span role="gridcell">
								<button
									type="button"
									class="cell"
									data-index={i}
									tabindex={i === focused ? 0 : -1}
									aria-label={emoji.name}
									title={emoji.url ? emoji.value : emoji.name}
									onfocus={() => (focused = i)}
									onmouseenter={() => (preview = emoji)}
									onmouseleave={() => (preview = null)}
									onclick={() => pick(emoji)}
								>
									{#if emoji.url}<img src={emoji.url} alt="" />{:else}{withSkinTone(
											emoji,
											tone
										)}{/if}
								</button>
							</span>
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	</div>
	<EmojiPickerFooter {shown} bind:tone />
</div>

<style>
	/* Campsite's reaction picker: 424px tall, nine 34px cells a row, sections under 12px
	   headings. In a sheet on small screens the grid keeps its width, centred. */
	.picker {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: auto auto 1fr auto;
		inline-size: 100%;
		block-size: 26.5rem;
	}

	.search {
		margin: var(--gap-sm);
	}

	.tabs {
		padding-inline: var(--gap-sm);
		border-block-end: var(--border-w-hairline) solid var(--hue-z2-border);
	}

	.tab,
	.cell {
		display: grid;
		place-items: center;
		inline-size: 2.125rem;
		block-size: 2.125rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: inherit;
		font-size: var(--text-xl);
		line-height: var(--leading-ui);
		cursor: pointer;
	}

	.tab {
		flex: 1;
		min-inline-size: 0;
		border-radius: 0;
		color: var(--hue-z2-muted);
		font-size: var(--text-md);
	}

	.tab[aria-current='true'] {
		box-shadow: inset 0 calc(-1 * var(--border-w-thick)) 0 currentColor;
		color: var(--hue-z2-fg);
	}

	.cell:hover,
	.cell:focus-visible {
		background-color: var(--hue-selected);
	}

	.cell img {
		inline-size: var(--gap-xl);
		block-size: var(--gap-xl);
		object-fit: contain;
	}

	/* The grid is exactly as wide as the popover's inside. Where scrollbars take room (Windows,
	   Linux, a mouse on macOS) a thin one sits in its own gutter, so the ninth column never
	   spills into a sideways scroll. */
	.scroller {
		overflow-x: hidden;
		overflow-y: auto;
		padding: 0 0 var(--gap-sm);
		scrollbar-gutter: stable;
		scrollbar-width: thin;
	}

	.heading,
	.grid {
		inline-size: calc(9 * 2.125rem);
		margin-inline: auto;
	}

	.heading {
		margin-block: 0;
		padding: var(--gap-lg) 0.375rem var(--gap-xs);
		color: var(--hue-text-secondary);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
	}

	.row {
		display: flex;
	}

	.empty {
		display: grid;
		gap: var(--gap-xs);
		padding: var(--gap-lg) var(--gap-sm);
		color: var(--hue-z2-muted);
	}
</style>
