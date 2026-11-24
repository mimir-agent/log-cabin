<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, userEvent, within } from 'storybook/test';
	import ThreadAvatar from '#lib/components/chat/ThreadAvatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { addNav, nav } from '#lib/nav.js';
	import { shell } from '#lib/strings/shell.js';
	import AppShell from './AppShell.svelte';
	import Avatar from './Avatar.svelte';
	import EmptyState from './EmptyState.svelte';
	import ListRow from './ListRow.svelte';
	import PageColumns from './PageColumns.svelte';
	import PageHeader from './PageHeader.svelte';
	import SidebarLink from './SidebarLink.svelte';

	// Stand-ins for the links modules register.
	const sample = [
		{ href: '/inbox', label: 'Inbox', order: 10 },
		{ href: '/posts', label: 'Posts', order: 20 },
		{ href: '/notes', label: 'Notes', order: 30 },
		{ href: '/chat', label: 'Chat', order: 40 },
		{ href: '/calls', label: 'Calls', order: 50 }
	];
	addNav(...sample.filter((item) => !nav.some((existing) => existing.href === item.href)));

	const { Story } = defineMeta({
		title: 'Shell/AppShell',
		component: AppShell,
		parameters: { layout: 'fullscreen' },
		args: {
			orgName: 'Northwind Trading',
			userName: 'Grace Hopper',
			role: 'member',
			currentPath: '/posts/42',
			counts: { '/inbox': 3, '/chat': 12 }
		}
	});

	const projectNames = [
		'Design',
		'Engineering',
		'Launch: March release',
		'Operations and facilities'
	];
</script>

<Story name="Post with rail">
	{#snippet template(args)}
		<AppShell {...args}>
			{#snippet projects()}
				{#each projectNames as project (project)}
					<SidebarLink href="/projects/{project}">
						{#snippet leading()}<Avatar name={project} size="xs" shape="square" />{/snippet}
						{project}
					</SidebarLink>
				{/each}
			{/snippet}
			<PageHeader title="Launch checklist for the March release">
				{#snippet description()}Launch: March release{/snippet}
			</PageHeader>
			<PageColumns width="reading" railLabel="Details">
				<h1 class="u:type-display" style="margin: 0 0 var(--gap-lg)">
					Launch checklist for the March release
				</h1>
				<div class="prose">
					<p>
						Three blockers left before we can ship: the <a href="#m">database migration</a>, the
						billing copy, and the status page. <span class="mention">@Alan Turing</span> owns the migration.
					</p>
					<h2>What's left</h2>
					<ul>
						<li>Run the migration on staging and time it</li>
						<li>Final pass on the billing emails</li>
						<li>Point the status page at the new region</li>
					</ul>
					<blockquote>We ship when the migration runs clean twice in a row.</blockquote>
					<p>Run it with <code>pnpm db:migrate</code> and paste the timing here.</p>
					<pre><code
							>$ pnpm db:migrate
applied 0003_posts.sql in 412ms</code
						></pre>
				</div>
				{#snippet rail()}
					<p style="margin: 0; color: var(--hue-z1-muted); font-size: var(--type-caption)">
						Posted by Grace Hopper · 9:41
					</p>
				{/snippet}
			</PageColumns>
		</AppShell>
	{/snippet}
</Story>

<!-- A call going on: a green dot beside Calls in the sidebar. -->
<Story
	name="Call live"
	args={{ live: { '/calls': shell.callsLive(1) } }}
	play={async ({ canvasElement }) => {
		const dots = within(canvasElement).getAllByRole('img', { name: shell.callsLive(1) });
		await expect(dots.length).toBeGreaterThan(0);
		for (const dot of dots) await expect(dot.closest('a')).toHaveAttribute('href', '/calls');
	}}
>
	{#snippet template(args)}
		<AppShell {...args}>
			<PageHeader title="Notes" />
			<EmptyState title="No notes yet" />
		</AppShell>
	{/snippet}
</Story>

<Story name="Inbox list" args={{ currentPath: '/inbox' }}>
	{#snippet template(args)}
		<AppShell {...args}>
			<PageHeader title="Inbox">
				{#snippet description()}3 unread{/snippet}
			</PageHeader>
			<ListRow href="#1" unread>
				{#snippet leading()}<Avatar name="Alan Turing" size="md" />{/snippet}
				Alan Turing replied to Launch checklist
				{#snippet description()}Migration ran clean on staging, 412ms.{/snippet}
				{#snippet meta()}<time>9:52</time>{/snippet}
			</ListRow>
			<ListRow href="#2">
				{#snippet leading()}<Avatar name="Hedy Lamarr" size="md" />{/snippet}
				Hedy Lamarr mentioned you in Retro notes
				{#snippet description()}@Grace can you take the billing copy?{/snippet}
				{#snippet meta()}<time>Tue</time>{/snippet}
			</ListRow>
		</AppShell>
	{/snippet}
</Story>

<Story
	name="Opening a page"
	args={{ currentPath: '/inbox' }}
	parameters={{
		sveltekit_experimental: {
			state: {
				navigating: {
					to: { url: new URL('http://localhost/inbox'), params: {}, route: { id: '/inbox' } }
				}
			}
		}
	}}
>
	{#snippet template(args)}
		<AppShell {...args}>
			<PageHeader title="Notes" />
			<EmptyState title="No notes yet" />
		</AppShell>
	{/snippet}
</Story>

<!-- The Favorites group above the projects: a starred project, a thread with something unread,
     and a note. -->
<Story
	name="Favorites"
	args={{ currentPath: '/notes' }}
	play={async ({ canvasElement }) => {
		const favorites = within(canvasElement).getAllByRole('region', { name: 'Favorites' })[0];
		const links = within(favorites).getAllByRole('link');
		await expect(links).toHaveLength(3);
		for (const [i, name] of ['Design', 'Ada and Bo', 'Launch plan'].entries()) {
			// A project's mark is an image named after it, so its name ends the link's.
			await expect(links[i]).toHaveAccessibleName(new RegExp(`${name}$`));
		}
		await expect(links[1]).toHaveAttribute('data-unread');
	}}
>
	{#snippet template(args)}
		<AppShell {...args}>
			{#snippet favorites()}
				<SidebarLink href="/projects/design">
					{#snippet leading()}<Avatar name="Design" size="xs" shape="square" />{/snippet}
					Design
				</SidebarLink>
				<SidebarLink href="/chat/1" unread>
					{#snippet leading()}<ThreadAvatar faces={['Ada', 'Bo']} group size="xs" />{/snippet}
					Ada and Bo
				</SidebarLink>
				<SidebarLink href="/notes/1">
					{#snippet leading()}<Icon name="note-filled" />{/snippet}
					Launch plan
				</SidebarLink>
			{/snippet}
			{#snippet projects()}
				{#each projectNames as project (project)}
					<SidebarLink href="/projects/{project}">
						{#snippet leading()}<Avatar name={project} size="xs" shape="square" />{/snippet}
						{project}
					</SidebarLink>
				{/each}
			{/snippet}
			<PageHeader title="Notes" />
			<EmptyState title="No notes yet" />
		</AppShell>
	{/snippet}
</Story>

<!-- Closed, the Favorites group keeps only the thread with something unread. -->
<Story
	name="Favorites collapsed"
	args={{ currentPath: '/notes' }}
	play={async ({ canvasElement }) => {
		const favorites = within(canvasElement).getAllByRole('region', { name: 'Favorites' })[0];
		const toggle = within(favorites).getByRole('button', { name: 'Favorites' });
		await userEvent.click(toggle);
		const links = within(favorites).getAllByRole('link');
		await expect(links).toHaveLength(1);
		await expect(links[0]).toHaveAccessibleName(/Ada and Bo$/);
		await expect(links[0]).toHaveAttribute('data-unread');
		// The fold is remembered between visits, so leave it open for the other stories.
		await userEvent.click(toggle);
	}}
>
	{#snippet template(args)}
		<AppShell {...args}>
			{#snippet favorites()}
				<SidebarLink href="/projects/design">
					{#snippet leading()}<Avatar name="Design" size="xs" shape="square" />{/snippet}
					Design
				</SidebarLink>
				<SidebarLink href="/chat/1" unread>
					{#snippet leading()}<ThreadAvatar faces={['Ada', 'Bo']} group size="xs" />{/snippet}
					Ada and Bo
				</SidebarLink>
				<SidebarLink href="/notes/1">
					{#snippet leading()}<Icon name="note-filled" />{/snippet}
					Launch plan
				</SidebarLink>
			{/snippet}
			<PageHeader title="Notes" />
			<EmptyState title="No notes yet" />
		</AppShell>
	{/snippet}
</Story>

<Story name="Empty" args={{ currentPath: '/notes' }}>
	{#snippet template(args)}
		<AppShell {...args}>
			<PageHeader title="Notes" />
			<EmptyState
				title="No notes yet"
				description="Notes are documents your team writes together: specs, plans, meeting notes."
			/>
		</AppShell>
	{/snippet}
</Story>
