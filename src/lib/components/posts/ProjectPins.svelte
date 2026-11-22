<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import type { IconName } from '#lib/components/ui/icons/campsite-icons.js';
	import type { Pin } from '#lib/server/posts/pins.js';
	import { posts } from '#lib/strings/posts.js';

	const { pins, canWrite }: { pins: Pin[]; canWrite: boolean } = $props();
	const s = posts.pins;

	const icons: Record<Pin['type'], IconName> = { post: 'post', note: 'note', call: 'video-camera' };
	const href = (pin: Pin) =>
		pin.type === 'post'
			? resolve('/posts/[id]', { id: pin.id })
			: pin.type === 'note'
				? resolve('/notes/[id]', { id: pin.id })
				: resolve('/calls/[id]', { id: pin.id });
	const title = (pin: Pin) => pin.title || s.untitledCall(pin.at, page.data.timeZone);
</script>

<!-- A bordered list above the feed, one row a pin: what it is as an icon, its title, unpin. -->
<section aria-labelledby="pins-title">
	<h2 id="pins-title" class="heading">{s.title}</h2>
	<ol class="list" role="list">
		{#each pins as pin (`${pin.type}:${pin.id}`)}
			<li class="row">
				<span class="kind" title={s.kinds[pin.type]}>
					<Icon name={icons[pin.type]} />
					<span class="u:visually-hidden">{s.kinds[pin.type]}</span>
				</span>
				<a class="title" href={href(pin)} title={title(pin)}>{title(pin)}</a>
				{#if canWrite}
					<form method="POST" action="?/unpin" use:enhance>
						<input type="hidden" name="subjectType" value={pin.type} />
						<input type="hidden" name="subjectId" value={pin.id} />
						<IconButton
							type="submit"
							icon="pin-tack-filled"
							label={s.unpinItem(title(pin))}
							quiet
						/>
					</form>
				{/if}
			</li>
		{/each}
	</ol>
</section>

<style>
	.heading {
		margin: 0 0 var(--gap-sm);
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
	}

	.list {
		margin: 0;
		padding: 0;
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-surface);
		list-style: none;
	}

	.row {
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		min-block-size: var(--control-h-lg);
		padding-inline: var(--gap-md) var(--gap-xs);
	}

	.row + .row {
		border-block-start: var(--border-w-hairline) solid var(--hue-border-secondary);
	}

	.kind {
		display: flex;
		flex: none;
		color: var(--hue-z0-muted);
	}

	.title {
		flex: 1;
		overflow: hidden;
		color: var(--hue-z0-fg);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.title:hover {
		text-decoration: underline;
	}
</style>
