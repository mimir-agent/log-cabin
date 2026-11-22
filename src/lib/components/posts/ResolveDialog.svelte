<script lang="ts">
	import { enhance } from '$app/forms';
	import type { DocNode } from '#lib/editor/doc.js';
	import Editor from '#lib/components/editor/Editor.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { failureText, postAction } from '#lib/forms/submit.js';
	import { posts } from '#lib/strings/posts.js';

	type Props = {
		open: boolean;
		members: { id: string; name: string }[];
		uploadUrl: string;
		/** Workers AI is on for this organization: offers Draft with AI. */
		canDraft: boolean;
	};

	let { open = $bindable(), members, uploadUrl, canDraft }: Props = $props();
	const s = posts.resolve;
	let message = $state<string | null>(null);
	let drafting = $state(false);
	/** The AI's draft, once there is one. Giving the editor a new one starts it afresh. */
	let draft = $state.raw<DocNode | null>(null);

	async function writeDraft() {
		drafting = true;
		message = null;
		const result = await postAction('?/draft', new FormData());
		drafting = false;
		if (result.type === 'success') draft = result.data!.draft as DocNode;
		else message = failureText(result);
	}
</script>

<!-- Campsite's resolve dialog: the post editor's tools, without its `/` menu. -->
<Dialog bind:open title={s.dialogTitle} description={s.dialogIntro} size="2xl">
	<form
		id="resolve-post"
		method="POST"
		action="?/resolve"
		use:enhance={() =>
			async ({ result, update }) => {
				if (result.type === 'failure') {
					message = failureText(result);
					return;
				}
				await update();
				open = false;
			}}
	>
		{#if message}<p class="alert" role="alert">{message}</p>{/if}
		{#key draft}
			<Editor
				name="resolution"
				value={draft}
				checklists
				bubble
				toolbarLast
				placeholder={s.placeholder}
				{members}
				{uploadUrl}
				autofocus
			/>
		{/key}
		{#if draft}<p class="notice">{s.draftNotice}</p>{/if}
	</form>
	{#snippet actions()}
		{#if canDraft}
			<Button onclick={writeDraft} disabled={drafting}>
				{drafting ? s.drafting : s.draft}
			</Button>
		{/if}
		<Button onclick={() => (open = false)}>{s.cancel}</Button>
		<SuedeButton type="submit" form="resolve-post">{s.submit}</SuedeButton>
	{/snippet}
</Dialog>

<style>
	.notice {
		margin: var(--gap-sm) 0 0;
		font-size: var(--type-caption);
	}

	.alert {
		margin: 0 0 var(--gap-sm);
		color: var(--hue-danger);
		font-size: var(--type-body);
	}
</style>
