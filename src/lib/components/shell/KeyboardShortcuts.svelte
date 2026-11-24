<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/GlobalKeyboardShortcuts/index.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
Campsite's global keyboard shortcuts, with Log Cabin's routes, and `?` for a sheet that lists
them. None of them fires while someone types into a field or an editor.
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import { typingIn } from '#lib/keyboard.js';
	import { shell } from '#lib/strings/shell.js';

	const s = shell.shortcuts;

	type Props = {
		/** Whether `c` opens the New menu; without a project to post in it does nothing. */
		canCreate?: boolean;
		/** Whether the sheet is showing; `?` toggles it. */
		open?: boolean;
	};
	let { canCreate = false, open = $bindable(false) }: Props = $props();

	// Campsite sets these in GlobalKeyboardShortcuts (g i, g h, g d, g a), the sidebar (/) and
	// its new post button (c). Ours has no href for `c`: it opens the New menu.
	type Go = { keys: string[]; label: string; href?: string };
	const goes: Go[] = $derived([
		{ keys: ['g', 'i'], label: s.go.inbox, href: resolve('/inbox') },
		{ keys: ['g', 'h'], label: s.go.home, href: resolve('/') },
		{ keys: ['g', 'd'], label: s.go.notes, href: resolve('/notes') },
		{ keys: ['g', 'a'], label: s.go.activity, href: resolve('/activity') },
		{ keys: ['/'], label: s.go.search, href: resolve('/search') },
		...(canCreate ? [{ keys: ['c'], label: s.newPost }] : [])
	]);

	/** The keys of a sequence typed so far, forgotten after a second's pause. */
	let typed: string[] = [];
	let pause: ReturnType<typeof setTimeout> | undefined;

	const startsWith = (keys: string[], sequence: string[]) =>
		sequence.every((key, i) => keys[i] === key);

	function onkeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
		if (event.defaultPrevented || typingIn(event.target)) return;
		if (event.key === '?') {
			event.preventDefault();
			open = !open;
			return;
		}
		clearTimeout(pause);
		// A key that doesn't continue the sequence may start a new one.
		let sequence = [...typed, event.key];
		if (!goes.some((go) => startsWith(go.keys, sequence))) sequence = [event.key];
		const found = goes.filter((go) => startsWith(go.keys, sequence));
		const done = found.find((go) => go.keys.length === sequence.length);
		typed = found.length && !done ? sequence : [];
		if (typed.length) pause = setTimeout(() => (typed = []), 1000);
		if (!done) return;
		event.preventDefault();
		open = false;
		if (!done.href) return openCreateMenu();
		// Going where you already are does nothing, as Campsite's / does on its search page.
		if (page.url.pathname === done.href) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- every href is resolved above
		goto(done.href);
	}

	/** Opens the New menu from the button that is on screen, as Enter on it would. */
	function openCreateMenu() {
		const button = [...document.querySelectorAll<HTMLElement>('[data-create-trigger]')].find((el) =>
			el.checkVisibility()
		);
		button?.focus();
		button?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
	}

	const modKey = () =>
		/Mac|iPhone|iPad/.test(navigator.userAgent) ? s.modKey.apple : s.modKey.other;
</script>

<svelte:window {onkeydown} />

<Dialog bind:open title={s.sheet.title} description={s.sheet.description} size="sm">
	<ul class="rows" role="list">
		{#each goes as go (go.label)}
			<li>{go.label} <span class="keys">{@render keys(go.keys)}</span></li>
		{/each}
		<li>{s.switcher} <span class="keys"><kbd>{modKey()}</kbd><kbd>K</kbd></span></li>
		<li>{s.help} <span class="keys"><kbd>?</kbd></span></li>
	</ul>
</Dialog>

{#snippet keys(sequence: string[])}
	{#each sequence as key, i (i)}
		{#if i > 0}<span class="then">{s.sheet.then}</span>{/if}<kbd>{key.toUpperCase()}</kbd>
	{/each}
{/snippet}

<style>
	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.rows > li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-md);
		min-block-size: var(--control-h-lg);
		font-size: var(--type-body);
	}

	.rows > li + li {
		border-block-start: var(--border-w-hairline) solid var(--hue-z2-border);
	}

	.keys {
		display: flex;
		align-items: center;
		gap: var(--gap-xs);
	}

	/* Campsite's key chip, as in a menu row: 12px semibold in the second grey. */
	kbd {
		min-inline-size: var(--gap-xl);
		padding: var(--gap-xs) var(--gap-sm);
		border-radius: var(--radius-sm);
		background-color: var(--hue-kbd-bg);
		color: var(--hue-text-secondary);
		font-family: inherit;
		font-size: var(--type-caption);
		font-weight: var(--fw-semibold);
		line-height: 1;
		text-align: center;
	}

	.then {
		color: var(--hue-z2-muted);
		font-size: var(--type-caption);
	}
</style>
