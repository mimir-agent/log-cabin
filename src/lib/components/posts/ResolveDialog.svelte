<script lang="ts">
	import { enhance } from '$app/forms';
	import Editor from '#lib/components/editor/Editor.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { failureText } from '#lib/forms/submit.js';
	import { posts } from '#lib/strings/posts.js';

	type Props = {
		open: boolean;
		members: { id: string; name: string }[];
		uploadUrl: string;
	};

	let { open = $bindable(), members, uploadUrl }: Props = $props();
	const s = posts.resolve;
	let message = $state<string | null>(null);
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
		<Editor
			name="resolution"
			checklists
			bubble
			toolbarLast
			placeholder={s.placeholder}
			{members}
			{uploadUrl}
			autofocus
		/>
	</form>
	{#snippet actions()}
		<Button onclick={() => (open = false)}>{s.cancel}</Button>
		<SuedeButton type="submit" form="resolve-post">{s.submit}</SuedeButton>
	{/snippet}
</Dialog>

<style>
	.alert {
		margin: 0 0 var(--gap-sm);
		color: var(--hue-danger);
		font-size: var(--type-body);
	}
</style>
