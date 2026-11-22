<!--
@component
Campsite's note hover card: resting the pointer on, or focusing, a link to a note inside `root`
shows that note's title, author, last update and thumbnail. It listens on `root`, so it covers
links drawn later too, as in a live note. A note this reader can't open shows nothing at all.
-->
<script module lang="ts">
	type NoteCard = {
		title: string;
		authorName: string;
		updatedAt: number;
		thumbnailVersion: number | null;
	};

	/**
	 * Each note's card, asked for once per page: null for a note this reader can't open. A failed
	 * ask is forgotten, so the next hover tries again. Plain on purpose: handlers read it,
	 * nothing draws it.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const cards = new Map<string, Promise<NoteCard | null>>();

	async function fetchCard(id: string): Promise<NoteCard | null> {
		const url = `/notes/${encodeURIComponent(id)}/card`;
		const response = await fetch(url);
		if (response.ok) return (await response.json()) as NoteCard;
		if (response.status === 404) return null;
		throw new Error(
			`${url} answered ${response.status}; expected 200, or 404 for a note this reader can't open`
		);
	}

	function cardOf(id: string): Promise<NoteCard | null> {
		let card = cards.get(id);
		if (!card) {
			card = fetchCard(id);
			cards.set(id, card);
			card.catch(() => cards.delete(id));
		}
		return card;
	}
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Popover from '#lib/components/ui/Popover.svelte';
	import { linkedNoteId } from '#lib/editor/doc.js';
	import { notes as strings } from '#lib/strings/notes.js';
	import { time } from '#lib/strings/time.js';

	let { root }: { root: HTMLElement | undefined } = $props();

	const openDelayMs = 300;

	let shown = $state<{ id: string; link: HTMLAnchorElement; card: NoteCard } | null>(null);

	function noteLink(target: EventTarget | null): [HTMLAnchorElement, string] | null {
		const link = target instanceof Element ? target.closest('a[href]') : null;
		const id = link && linkedNoteId(link.getAttribute('href')!);
		return id ? [link as HTMLAnchorElement, id] : null;
	}

	$effect(() => {
		if (!root) return;
		const container = root;
		let current: HTMLAnchorElement | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const hide = () => {
			clearTimeout(timer);
			current = null;
			shown = null;
		};
		const enter = (event: Event) => {
			const found = noteLink(event.target);
			if (!found || found[0] === current) return;
			hide();
			const [link, id] = found;
			current = link;
			timer = setTimeout(async () => {
				// A card is a nicety: a failed one leaves the link as it is, and is reported.
				const card = await cardOf(id).catch((e) => console.error(e));
				if (card && current === link) shown = { id, link, card };
			}, openDelayMs);
		};
		/** The pointer or focus left the link for somewhere outside it. */
		const leave = (event: Event) => {
			const next = (event as PointerEvent | FocusEvent).relatedTarget;
			const inside = (node: unknown) => node instanceof Node && current!.contains(node);
			if (current && inside(event.target) && !inside(next)) hide();
		};
		const listeners = { pointerover: enter, focusin: enter, pointerout: leave, focusout: leave };
		for (const [type, listener] of Object.entries(listeners)) {
			container.addEventListener(type, listener);
		}
		return () => {
			hide();
			for (const [type, listener] of Object.entries(listeners)) {
				container.removeEventListener(type, listener);
			}
		};
	});
</script>

{#if shown}
	{@const { id, link, card } = shown}
	{@const title = card.title || strings.editor.titlePlaceholder}
	<Popover open anchor={link} label={title} onOpenChange={(open) => open || (shown = null)}>
		<div class="card">
			{#if card.thumbnailVersion !== null}
				<img
					src={`${resolve('/notes/[id]/thumbnail', { id })}?size=grid&v=${card.thumbnailVersion}`}
					alt=""
				/>
			{/if}
			<p class="title">{title}</p>
			<p class="meta">
				{card.authorName} ·
				<time
					datetime={new Date(card.updatedAt).toISOString()}
					title={time.long(card.updatedAt, page.data.timeZone)}
					>{strings.list.updated(card.updatedAt, page.data.timeZone)}</time
				>
			</p>
		</div>
	</Popover>
{/if}

<style>
	.card {
		display: grid;
		gap: var(--gap-xs);
	}

	img {
		display: block;
		inline-size: 100%;
		block-size: auto;
		margin-block-end: var(--gap-xs);
		border: var(--border-w-hairline) solid var(--hue-z2-border);
		border-radius: var(--radius-control);
	}

	p {
		margin: 0;
	}

	.title {
		font-weight: var(--fw-medium);
	}

	.meta {
		color: var(--hue-z2-muted);
		font-size: var(--type-caption);
	}
</style>
