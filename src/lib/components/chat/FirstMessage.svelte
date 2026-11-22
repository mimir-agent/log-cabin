<!-- Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Chat/CreateChatThreadDialog.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/ -->
<!--
@component
The first message in the new-conversation step, after Campsite's create dialog
(CreateChatThreadDialog, CC BY-NC 4.0): text sent as `body`, and files sent as `files` with the
form, stored once the conversation exists.
-->
<script lang="ts">
	import Editor from '#lib/components/editor/Editor.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { chat } from '#lib/strings/chat.js';

	type Props = { members: { id: string; name: string }[] };

	let { members }: Props = $props();
	const s = chat.start;
	let chosen = $state<string[]>([]);
</script>

<div class="first">
	<Editor name="body" compact formatting={false} placeholder={s.firstMessage} {members} />
	<label class="attach">
		<Icon name="paperclip" />
		<span>{s.attach}</span>
		<input
			class="u:visually-hidden"
			type="file"
			name="files"
			multiple
			onchange={(event) => (chosen = [...(event.currentTarget.files ?? [])].map((f) => f.name))}
		/>
	</label>
	{#if chosen.length}<p class="chosen">{s.attached(chosen)}</p>{/if}
</div>

<style>
	.first {
		display: grid;
		gap: var(--gap-sm);
	}

	.attach {
		display: inline-flex;
		gap: var(--gap-xs);
		align-items: center;
		justify-self: start;
		min-block-size: var(--control-h-sm);
		padding: 0 var(--gap-sm);
		border-radius: var(--radius-surface);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		cursor: pointer;
	}

	.attach:hover,
	.attach:has(:focus-visible) {
		background-color: var(--hue-hover);
		color: var(--hue-z0-fg);
	}

	.attach:has(:focus-visible) {
		outline: var(--focus-ring-width) solid var(--hue-focus-ring);
	}

	.chosen {
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}
</style>
