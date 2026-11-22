<script lang="ts">
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { posts } from '#lib/strings/posts.js';

	type Props = {
		/** Where a new post starts: a project's composer. */
		href: string;
		user: { name: string; avatarUrl?: string | null };
	};

	let { href, user }: Props = $props();
</script>

<!-- Campsite's inline composer: the whole row opens a new post. Its Post button is only a
     promise of where the action lands, so it's drawn disabled and isn't a control. -->
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a class="composer" data-press {href}>
	<span class="me">
		<Avatar name={user.name} src={user.avatarUrl} size="lg" />
		<span class="plus" aria-hidden="true"><Icon name="plus" size={18} strokeWidth="2.5" /></span>
	</span>
	<span class="prompt">{posts.feed.share}</span>
	<span class="post" aria-hidden="true">{posts.composer.submit}</span>
</a>

<style>
	.composer {
		position: relative;
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		margin-inline: calc(var(--gap-sm) * -1);
		padding: var(--gap-md) var(--gap-lg);
		border-radius: var(--radius-surface);
		background-color: light-dark(var(--hue-gray-50), var(--hue-gray-900));
		box-shadow:
			0 1px 2px 0 rgb(0 0 0 / 0.05),
			0 0 0 0.5px light-dark(rgb(0 0 0 / 0.08), rgb(255 255 255 / 0.06));
		color: var(--hue-z0-muted);
		text-decoration: none;
		transition:
			background-color var(--motion-fast) var(--motion-ease),
			box-shadow var(--motion-fast) var(--motion-ease);
	}

	.composer:hover {
		background-color: light-dark(var(--hue-white), var(--hue-gray-800));
		box-shadow:
			var(--shadow-card),
			0 0 0 0.5px light-dark(rgb(0 0 0 / 0.08), rgb(255 255 255 / 0.06));
	}

	.me {
		position: relative;
		display: flex;
	}

	/* The plus sits in a cut-out of the avatar: a ring of the composer's own colour. */
	.plus {
		position: absolute;
		inset-block-end: -4px;
		inset-inline-end: -4px;
		display: grid;
		place-items: center;
		inline-size: 1.375rem;
		block-size: 1.375rem;
		border-radius: var(--radius-full);
		background-color: light-dark(var(--hue-black), var(--hue-gray-750));
		box-shadow: 0 0 0 2px light-dark(var(--hue-gray-50), var(--hue-gray-900));
		color: var(--hue-white);
		transition: box-shadow var(--motion-fast) var(--motion-ease);
	}

	.composer:hover .plus {
		box-shadow: 0 0 0 2px light-dark(var(--hue-white), var(--hue-gray-800));
	}

	.prompt {
		flex: 1;
		min-inline-size: 0;
		overflow: hidden;
		font-size: var(--type-prose);
		line-height: 1.375rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.post {
		display: inline-flex;
		flex: none;
		align-items: center;
		block-size: var(--control-h-sm);
		padding-inline: 0.625rem;
		border-radius: var(--radius-control);
		background-color: var(--hue-accent);
		color: var(--hue-accent-fg);
		font-size: var(--type-body);
		font-weight: var(--fw-medium);
		opacity: 0.5;
	}
</style>
