<!--
@component
Campsite's new-post dialog (PostComposer.tsx, CC BY-NC 4.0, Campsite Software Co.): the
composer over whatever page you were on, a tenth of the way down, with the project picker in its
head, Expand and Close beside it, and Save draft and Post at its foot. Closing it, by Close, Esc
or the backdrop, keeps what was typed as a draft. Publishing closes it and says so with a link.
-->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import IconButton from '#lib/components/ui/IconButton.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';
	import { core } from '#lib/strings/core.js';
	import { posts } from '#lib/strings/posts.js';
	import PostComposer from './PostComposer.svelte';

	type Composing = {
		project: { id: string; name: string };
		guests: number;
		members: { id: string; name: string }[];
		projects: { id: string; name: string; accessory: string | null }[];
	};

	/** The project it opens in; the picker can change it. */
	const { projectId }: { projectId: string } = $props();
	const s = posts.composer;

	let open = $state(true);
	let expanded = $state(false);
	let data = $state.raw<Composing | null>(null);
	let composer = $state<PostComposer>();

	async function load(id: string) {
		const response = await fetch(`/projects/${id}/composer`);
		if (!response.ok) {
			const failure = await response.json().catch(() => ({ message: response.statusText }));
			toast((failure as { message: string }).message);
			return;
		}
		data = await response.json();
	}
	$effect(() => void load(projectId));

	// Back to the page underneath: the history entry the dialog added, or, opened from its own
	// address, the project's page. Once only: Esc closes the dialog and then reports it.
	let leaving = false;
	async function leave() {
		if (leaving) return false;
		leaving = true;
		open = false;
		if (page.state.newPost) {
			const popped = new Promise((done) => addEventListener('popstate', done, { once: true }));
			history.back();
			await popped;
		} else {
			await goto(resolve('/projects/[id]', { id: projectId }), { replaceState: true });
		}
		return true;
	}

	async function close(kept?: boolean) {
		if (leaving) return;
		const draft = kept ?? (await composer?.keep());
		if (!(await leave())) return;
		if (draft) toast(s.draftKept, { href: resolve('/drafts'), label: s.viewDrafts });
	}

	async function published(href: string) {
		if (!(await leave())) return;
		await invalidateAll();
		toast(s.created, { href, label: s.view });
	}
</script>

<Dialog
	bind:open
	bare
	size={expanded ? '3xl' : '2xl'}
	fill={expanded}
	title={s.newPost}
	description={s.bodyPlaceholder}
	onOpenChange={(isOpen) => !isOpen && close()}
>
	<div class="new-post">
		{#if data}
			<PostComposer
				bind:this={composer}
				projectId={data.project.id}
				projectName={data.project.name}
				members={data.members}
				fromMessage={page.state.fromMessage}
				shareDoc={page.state.shareDoc}
				action="/projects/{data.project.id}/new?/publish"
				picker={{ projects: data.projects, guests: data.guests }}
				onproject={load}
				onpublished={published}
				onkept={() => close(true)}
			>
				{#snippet tools()}
					<span class="wide">
						<IconButton
							icon={expanded ? 'minimize' : 'maximize'}
							label={expanded ? s.shrink : s.expand}
							onclick={() => (expanded = !expanded)}
						/>
					</span>
					<IconButton icon="close" label={core.actions.close} onclick={() => close()} />
				{/snippet}
			</PostComposer>
		{:else}
			<div class="loading"><Spinner label={s.newPost} /></div>
		{/if}
	</div>
</Dialog>

<style>
	/* The dialog is the card here: the composer drops its own corners and shadow and fills it. */
	.new-post {
		/* The dialog is already above the keyboard: its footer sticks to its own bottom. */
		--footer-inset: 0px;
		display: flex;
		flex: 1;
		flex-direction: column;
		min-block-size: 0;
		overflow-y: auto;
	}

	.new-post :global(form),
	.new-post :global(.composer) {
		display: flex;
		flex: 1;
		flex-direction: column;
		max-inline-size: none;
		margin-inline: 0;
	}

	.new-post :global(.composer-card) {
		flex: 1;
		border-radius: 0;
		box-shadow: none;
	}

	.loading {
		display: grid;
		place-items: center;
		min-block-size: 12rem;
	}

	/* Campsite hides Expand below 640px, where the dialog is already the screen's width. */
	@media (max-width: 39.99rem) {
		.wide {
			display: none;
		}
	}
</style>
