<!--
@component
The menu under your avatar, after Campsite's: your status first (set, change or clear it), then
your account pages and Sign out. The avatar wears your status emoji. In the sidebar the button is
the avatar alone; in the phone's tab bar it is a tab.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { DropdownMenu } from 'bits-ui';
	import type { NavItem } from '#lib/nav.js';
	import type { Status } from '#lib/people/status.js';
	import { auth } from '#lib/strings/auth.js';
	import { people } from '#lib/strings/people.js';
	import StatusLine from '#lib/components/people/StatusLine.svelte';
	import StatusPicker from '#lib/components/people/StatusPicker.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Menu from '#lib/components/ui/Menu.svelte';
	import Avatar from './Avatar.svelte';

	type Props = {
		userName: string;
		username: string;
		avatarUrl?: string | null;
		status: Status | null;
		/** The nav items placed in `account`. */
		items: NavItem[];
		variant: 'sidebar' | 'tab';
	};

	let { userName, username, avatarUrl, status, items, variant }: Props = $props();
	const s = people.status;

	let picking = $state(false);
</script>

<Menu side="top" align={variant === 'tab' ? 'end' : 'start'} minWidth="14rem">
	{#snippet trigger({ props })}
		<button {...props} class={variant === 'tab' ? 'tab' : 'me'} data-press aria-label={userName}>
			<span class="face">
				<Avatar name={userName} src={avatarUrl} size="sm" />
				{#if status}<span class="emoji" aria-hidden="true">{status.emoji}</span>{/if}
			</span>
		</button>
	{/snippet}
	<DropdownMenu.Group>
		<DropdownMenu.GroupHeading>{userName}</DropdownMenu.GroupHeading>
		{#if status}
			<p class="current"><StatusLine {status} /></p>
		{/if}
		<DropdownMenu.Item onSelect={() => (picking = true)}>
			<Icon name="face-smile-plus" />
			{status ? s.edit : s.set}
		</DropdownMenu.Item>
		{#if status}
			<form method="POST" action="/people/{encodeURIComponent(username)}?/clearStatus" use:enhance>
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<button {...props} type="submit">
							<Icon name="circle-filled-close" />
							{s.clear}
						</button>
					{/snippet}
				</DropdownMenu.Item>
			</form>
		{/if}
	</DropdownMenu.Group>
	<DropdownMenu.Separator />
	<DropdownMenu.Group>
		{#each items as item (item.href)}
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- registered in #lib/nav -->
					<a {...props} href={item.href}>
						{#if item.icon}<Icon name={item.icon} />{/if}
						{item.label}
					</a>
				{/snippet}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Group>
	<DropdownMenu.Separator />
	<form method="POST" action="/logout">
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<button {...props} type="submit">
					<Icon name="log-out" />
					{auth.signOut}
				</button>
			{/snippet}
		</DropdownMenu.Item>
	</form>
</Menu>

<StatusPicker {username} {status} bind:open={picking} />

<style>
	.me,
	.tab {
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}

	.me {
		inline-size: var(--control-h-sm);
		block-size: var(--control-h-sm);
		border-radius: var(--radius-full);
	}

	.me:hover,
	.me[data-state='open'] {
		background-color: var(--hue-fill);
	}

	.tab {
		min-block-size: var(--tap-min);
		border-radius: var(--radius-control);
	}

	.tab:hover,
	.tab[data-state='open'] {
		background-color: light-dark(var(--hue-gray-100), var(--hue-gray-800));
	}

	.tab:active {
		background-color: var(--hue-pressed);
	}

	.face {
		position: relative;
		display: grid;
	}

	.emoji {
		position: absolute;
		inset-block-end: -0.25rem;
		inset-inline-end: -0.375rem;
		font-size: 0.75rem;
		line-height: 1;
	}

	.current {
		margin: 0;
		padding: 0.25rem var(--gap-md);
		color: var(--hue-z2-muted);
	}

	form {
		display: contents;
	}

	@media (pointer: coarse) {
		.me {
			inline-size: var(--tap-min);
			block-size: var(--tap-min);
		}
	}
</style>
