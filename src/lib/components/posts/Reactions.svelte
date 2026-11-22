<script lang="ts" module>
	type Summary = { emoji: string; count: number; names: string[]; mine: boolean };

	// Reactions chosen here that the server hasn't confirmed yet, by subject, so a message's add
	// button and its pills show the same thing.
	let chosen = $state.raw<Record<string, Summary[]>>({});

	/** What to show for a subject: the reactions just chosen here, else the server's. */
	export function shownReactions(subjectId: string, summaries: Summary[]): Summary[] {
		return chosen[subjectId] ?? summaries;
	}

	/** `list` after you toggle `emoji`: added, joined, left, or gone with its last person. */
	function toggled(list: Summary[], emoji: string): Summary[] {
		const pill = list.find((r) => r.emoji === emoji);
		if (!pill) return [...list, { emoji, count: 1, names: [], mine: true }];
		if (pill.mine && pill.count === 1) return list.filter((r) => r !== pill);
		const change = pill.mine ? -1 : 1;
		return list.map((r) => (r === pill ? { ...r, count: r.count + change, mine: !r.mine } : r));
	}
</script>

<script lang="ts">
	import { flushSync } from 'svelte';
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Popover from '#lib/components/ui/Popover.svelte';
	import { optimistic } from '#lib/forms/submit.js';
	import type { OrgEmoji } from '#lib/emoji/picker.js';
	import { posts } from '#lib/strings/posts.js';
	import Emoji from './Emoji.svelte';
	import EmojiPicker from './EmojiPicker.svelte';

	type Props = {
		summaries: Summary[];
		subjectType: 'post' | 'note' | 'comment' | 'message';
		subjectId: string;
		canReact: boolean;
		/** Only the add button, for a row's hover actions when nothing has been reacted yet. */
		addOnly?: boolean;
		/** md 30px pills for posts and notes; sm 26px for comments and messages. */
		size?: 'sm' | 'md';
		/** The org's own emoji, shown in pills and offered in the picker. */
		orgEmoji: OrgEmoji;
		/** The page's content column, which the picker stays inside; null until the page draws it. */
		boundary: Element | null;
		/** The picker is open; a message's long-press sheet opens it with Add reaction. */
		picking?: boolean;
	};

	let {
		summaries,
		subjectType,
		subjectId,
		canReact,
		addOnly = false,
		size = 'md',
		orgEmoji,
		boundary,
		picking: open = $bindable(false)
	}: Props = $props();
	const s = posts.reactions;

	const shown = $derived(shownReactions(subjectId, summaries));
	const react = optimistic((data) => {
		const next = toggled(shown, String(data.get('emoji')));
		chosen = { ...chosen, [subjectId]: next };
		return () => {
			// A later toggle of the same subject owns it now.
			if (chosen[subjectId] !== next) return;
			chosen = Object.fromEntries(Object.entries(chosen).filter(([id]) => id !== subjectId));
		};
	});

	let picked = $state('');
	let pickForm = $state<HTMLFormElement>();

	function pick(emoji: string) {
		picked = emoji;
		flushSync();
		pickForm!.requestSubmit();
		open = false;
	}
</script>

{#snippet subject()}
	<input type="hidden" name="subjectType" value={subjectType} />
	<input type="hidden" name="subjectId" value={subjectId} />
{/snippet}

{#if addOnly ? canReact : shown.length > 0 || canReact}
	<div
		class="reactions"
		data-size={size}
		data-add-only={addOnly || undefined}
		role="group"
		aria-label={s.label}
	>
		{#each addOnly ? [] : shown as r (r.emoji)}
			{@const label = s.toggle(r.emoji, r.names)}
			{#if canReact}
				<form method="POST" action="?/react" use:enhance={react}>
					{@render subject()}
					<button
						class="pill"
						name="emoji"
						value={r.emoji}
						aria-pressed={r.mine}
						title={label}
						aria-label={label}
					>
						<span class="emoji"><Emoji value={r.emoji} customEmoji={orgEmoji.custom} /></span>
						<span class="count">{r.count}</span>
					</button>
				</form>
			{:else}
				<span class="pill" title={label} aria-label={label}>
					<span class="emoji"><Emoji value={r.emoji} customEmoji={orgEmoji.custom} /></span>
					<span class="count">{r.count}</span>
				</span>
			{/if}
		{/each}
		{#if canReact}
			<form bind:this={pickForm} method="POST" action="?/react" use:enhance={react} hidden>
				{@render subject()}
				<input type="hidden" name="emoji" value={picked} />
			</form>
			<Popover
				bind:open
				align="start"
				padding="none"
				width="20.125rem"
				label={s.add}
				{boundary}
				sheet
			>
				{#snippet trigger({ props })}
					<button {...props} class="add" data-press title={s.add} aria-label={s.add}>
						<Icon name="face-smile-plus" size={size === 'sm' || addOnly ? 20 : 24} />
					</button>
				{/snippet}
				<EmojiPicker onPick={pick} {orgEmoji} />
			</Popover>
		{/if}
	</div>
{/if}

<style>
	/* Campsite's reaction pills: grey until they're yours, then blue. 30px on posts, 26px on
	   comments, a little give when pressed. */
	.reactions {
		--pill-h: var(--control-h-sm);
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs) 2px;
		align-items: center;
		margin-inline-start: calc(var(--gap-xs) * -1);
	}

	.reactions[data-add-only] {
		margin: 0;
		--pill-h: var(--control-h-sm);
	}

	.reactions[data-size='sm'] {
		--pill-h: var(--control-h-xs);
		gap: var(--gap-xs);
	}

	.reactions form {
		display: contents;
	}

	.pill {
		display: inline-flex;
		gap: 0.375rem;
		align-items: center;
		min-inline-size: 2rem;
		block-size: var(--pill-h);
		padding: var(--gap-xs) 0.625rem var(--gap-xs) var(--gap-sm);
		border: 0;
		border-radius: var(--radius-full);
		background-color: light-dark(var(--hue-gray-100), var(--hue-gray-800));
		color: var(--hue-z0-fg);
		font-size: var(--type-caption);
		font-weight: var(--fw-semibold);
		line-height: 1;
		transition:
			background-color var(--motion-fast) var(--motion-ease),
			scale var(--motion-fast) var(--motion-ease);
	}

	.reactions[data-size='sm'] .pill {
		gap: 5px;
		padding: 2px var(--gap-sm) 2px 0.375rem;
	}

	.emoji {
		font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', emoji;
		font-size: var(--type-body);
	}

	.count {
		font-family: var(--ff-mono);
		font-variant-numeric: tabular-nums;
	}

	button.pill {
		cursor: pointer;
	}

	button.pill:hover {
		background-color: var(--hue-selected);
	}

	button.pill:active {
		scale: 0.9;
	}

	button.pill[aria-pressed='true'] {
		background-color: light-dark(
			color-mix(in srgb, var(--hue-blue-100) 70%, transparent),
			color-mix(in srgb, var(--hue-blue-900) 40%, transparent)
		);
		color: light-dark(var(--hue-blue-900), var(--hue-blue-400));
	}

	button.pill[aria-pressed='true']:hover {
		background-color: light-dark(
			var(--hue-blue-100),
			color-mix(in srgb, var(--hue-blue-900) 60%, transparent)
		);
	}

	.add {
		display: grid;
		place-items: center;
		inline-size: var(--pill-h);
		block-size: var(--pill-h);
		padding: 0;
		border: 0;
		border-radius: var(--radius-full);
		background: none;
		color: var(--hue-z0-muted);
		cursor: pointer;
	}

	.add:hover,
	.add[data-state='open'] {
		background-color: var(--hue-fill);
		color: var(--hue-z0-fg);
	}
</style>
