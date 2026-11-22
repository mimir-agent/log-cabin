<!--
@component
A joined call, after Campsite's ActiveCall (CC BY-NC 4.0): the whole window goes dark, the
title sits at the top left with any extra actions beside it, the tiles fill the middle and the
controls sit at the bottom.
-->
<script lang="ts">
	import type { ComponentProps, Snippet } from 'svelte';
	import { Portal } from 'bits-ui';
	import CallControls from '#lib/components/calls/CallControls.svelte';
	import CallStage, { type Tile } from '#lib/components/calls/CallStage.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { calls } from '#lib/strings/calls.js';

	type Props = ComponentProps<typeof CallControls> & {
		title: string;
		tiles: Tile[];
		stage: string | null;
		speaking: string | null;
		problem: string;
		/** More actions beside the title, such as Invite. */
		extras?: Snippet;
		/** A line under the title, such as the recording banner. */
		banner?: Snippet;
		/** The screen's element, which holds the video tiles. */
		element?: HTMLElement;
	};

	let {
		title,
		tiles,
		stage,
		speaking,
		problem,
		extras,
		banner,
		element = $bindable(),
		...controls
	}: Props = $props();

	/**
	 * Puts the rest of the page out of reach while the screen covers it: no focus, no clicks,
	 * nothing read out. Dialogs and menus opened from the screen are added to the body after
	 * it, so they stay reachable.
	 */
	function cover(screen: HTMLElement) {
		const covered = ([...document.body.children] as HTMLElement[]).filter(
			(el) => el !== screen && !el.inert
		);
		for (const el of covered) el.inert = true;
		return () => covered.forEach((el) => (el.inert = false));
	}
</script>

<Portal>
	<div
		class="screen"
		data-theme="dark"
		role="region"
		aria-label={title}
		bind:this={element}
		{@attach cover}
	>
		<header class="bar">
			<h1 class="title">{title}</h1>
			{@render extras?.()}
		</header>
		{@render banner?.()}

		{#if problem}
			<p class="problem" role="alert"><Icon name="warning-triangle" size={16} />{problem}</p>
		{/if}

		<CallStage {tiles} layout={controls.layout} {stage} {speaking} waiting={calls.room.waiting} />

		<CallControls {...controls} />
	</div>
</Portal>

<style>
	/* Over the whole app, the way Campsite opens a call in a window of its own. Dialogs and
	   menus opened from it sit above. */
	.screen {
		position: fixed;
		inset: 0;
		z-index: var(--z-overlay);
		display: flex;
		flex-direction: column;
		padding: max(var(--gap-sm), env(safe-area-inset-top))
			max(var(--gap-sm), env(safe-area-inset-right)) var(--safe-bottom)
			max(var(--gap-sm), env(safe-area-inset-left));
		background-color: var(--hue-media-bg);
		color: var(--hue-z0-fg);
	}

	.bar {
		display: flex;
		gap: var(--gap-xs);
		align-items: center;
		min-block-size: 2.625rem;
		padding: 0 0 var(--gap-xs) 0.75rem;
	}

	.title {
		margin: 0;
		overflow: hidden;
		font-size: var(--type-body);
		font-weight: var(--fw-semibold);
		line-height: 1.25rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.problem {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		align-self: center;
		max-inline-size: 100%;
		margin: 0 0 var(--gap-sm);
		padding: var(--gap-sm) var(--gap-md);
		border-radius: var(--radius-surface);
		background-color: var(--hue-z2-bg);
		box-shadow: var(--elevation-popover);
		font-size: var(--type-body);
	}
</style>
