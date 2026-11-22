<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { subscribe } from '#lib/realtime.js';
	import { calls } from '#lib/strings/calls.js';
	import { core } from '#lib/strings/core.js';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	const s = calls.personalRoom;
	const title = $derived(data.owner.isMe ? s.yours : s.of(data.owner.name));
	let copied = $state(false);

	// A call starting or ending in the room shows up without a reload.
	$effect(() =>
		subscribe(`room:${data.owner.userId}`, (payload) => {
			if (payload.type === 'call' || payload.type === 'resync') invalidate('calls:room');
		})
	);

	async function copy() {
		await navigator.clipboard.writeText(page.url.href);
		copied = true;
	}
</script>

<svelte:head>
	<title>{title} · {core.appName}</title>
</svelte:head>

<PageHeader {title} />

<!-- A room is a person: their face, whether anyone is in it now, the one thing to do, and
     the link to share, in the shape of Campsite's personal call link. -->
<div class="room">
	<Avatar name={data.owner.name} size="xl" />
	<p class="intro">{data.owner.isMe ? s.intro : s.introOther(data.owner.name)}</p>
	<p class="status" role="status" data-live={data.live ? '' : undefined}>
		{data.live ? s.inRoom(data.live.names) : s.empty}
	</p>
	<form method="POST" action="?/join">
		<Button type="submit" variant="primary">
			<Icon name="video-camera" size={16} />{data.live ? s.join : s.start}
		</Button>
	</form>
	<div class="link">
		<label class="u:visually-hidden" for="room-link">{s.link}</label>
		<input
			id="room-link"
			readonly
			value={page.url.href}
			onfocus={(e) => e.currentTarget.select()}
		/>
		<Button size="sm" onclick={copy}>
			<Icon name={copied ? 'check' : 'link'} size={16} />{copied ? s.copied : s.copy}
		</Button>
	</div>
</div>

<style>
	.room {
		display: flex;
		flex-direction: column;
		gap: var(--gap-lg);
		align-items: center;
		max-inline-size: 30rem;
		margin-inline: auto;
		padding: var(--gap-3xl) var(--gap-lg);
		text-align: center;
	}

	.intro,
	.status {
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		text-wrap: balance;
	}

	/* Someone is in it: a green dot, the call's colour, ahead of who. */
	.status[data-live] {
		color: var(--hue-z0-fg);
		font-weight: var(--fw-medium);
	}

	.status[data-live]::before {
		display: inline-block;
		inline-size: 0.5rem;
		block-size: 0.5rem;
		margin-inline-end: var(--gap-sm);
		border-radius: var(--radius-full);
		background-color: var(--hue-call);
		content: '';
		vertical-align: 0.0625rem;
	}

	.link {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		inline-size: 100%;
		padding: var(--gap-xs) var(--gap-xs) var(--gap-xs) var(--gap-md);
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-surface);
		background-color: var(--hue-z1-bg);
	}

	input {
		flex: 1;
		min-inline-size: 0;
		padding: 0;
		border: 0;
		background: none;
		color: var(--hue-z0-muted);
		font: inherit;
		font-size: var(--type-control);
		text-overflow: ellipsis;
	}

	input:focus-visible {
		outline: none;
	}

	.link:focus-within {
		outline: var(--focus-ring-width) solid var(--hue-focus-ring);
	}
</style>
