<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';
	import Editor from '#lib/components/editor/Editor.svelte';
	import { isModEnter } from '#lib/components/editor/keys.js';
	import RichText from '#lib/components/editor/RichText.svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';
	import { isEmptyDoc, type DocNode } from '#lib/editor/doc.js';
	import { failureText } from '#lib/forms/submit.js';
	import { newId } from '#lib/id.js';
	import { posts } from '#lib/strings/posts.js';

	type Props = {
		action: '?/comment' | '?/editComment' | '?/pin';
		replyTo?: string;
		commentId?: string;
		/** For ?/pin: the image and the point (fractions 0–1) the comment is pinned to. */
		pin?: { attachmentId: string; x: number; y: number };
		/** For a note's ?/comment: the passage it is made on, as SelectedPassage gives it. */
		passage?: { start: string; end: string };
		value?: DocNode | null;
		members: { id: string; name: string }[];
		/** The org's own emoji, for the comment shown the moment it's sent. */
		customEmoji: Record<string, string>;
		uploadUrl?: string;
		placeholder: string;
		submitLabel: string;
		/**
		 * Campsite's reply box at the foot of a thread: your avatar, the text with no box around
		 * it, and its controls only once it has focus or text. Cancel asks before throwing a
		 * reply away.
		 */
		inline?: boolean;
		oncancel?: () => void;
		/** Called after the server accepts the comment, e.g. to close an inline form. */
		onsaved?: () => void;
		/** The ids of the comments listed with this form, so a new one sent from it shows once. */
		listed?: string[];
	};

	const {
		action,
		replyTo,
		commentId,
		pin,
		passage,
		value = null,
		members,
		customEmoji,
		uploadUrl,
		placeholder,
		submitLabel,
		inline = false,
		oncancel,
		onsaved,
		listed = []
	}: Props = $props();
	const s = posts.comments;

	let resetKey = $state(0);
	let message = $state<string | null>(null);
	// A new comment shows above the box the moment it's sent, under the id the server will store
	// it with, until the list holds that id. One that didn't save comes back into the box with
	// its id, so nothing typed is lost and sending it again can't store it twice.
	let sent = $state.raw<{ id: string; doc: DocNode } | null>(null);
	let draft = $state.raw(untrack(() => value));
	let draftKey = $state(0);
	let draftId = $state<string | null>(null);
	// Campsite holds Comment, Reply and Save until there's something to send.
	let empty = $state(untrack(() => !value || isEmptyDoc(value)));
	let discarding = $state(false);

	// The answer was lost but the comment was stored: the list has it now, so the box lets go.
	$effect(() => {
		if (draftId === null || !listed.includes(draftId)) return;
		draftId = null;
		draft = null;
		draftKey++;
		empty = true;
		message = null;
		onsaved?.();
	});

	const submit: SubmitFunction = ({ formData }) => {
		const doc = JSON.parse(String(formData.get('body'))) as DocNode;
		const id = draftId ?? newId();
		draftId = null;
		if (action === '?/comment') formData.set('id', id);
		// Edits, and an empty comment the server will explain, wait for the server.
		const now = action === '?/comment' && !isEmptyDoc(doc);
		if (now) {
			sent = { id, doc };
			message = null;
			resetKey++;
		}
		return async ({ result, update }) => {
			const failed = result.type === 'failure' || result.type === 'error';
			if (failed && !listed.includes(id)) {
				if (now) {
					sent = null;
					draft = doc;
					draftKey++;
					draftId = id;
					empty = false;
				}
				if (result.type === 'failure') message = failureText(result);
				else toast(failureText(result));
				return;
			}
			if (!now) {
				message = null;
				resetKey++;
			}
			if (!failed) await update({ reset: false });
			sent = null;
			onsaved?.();
		};
	};

	// ⌘ or Ctrl with Enter sends from anywhere in the form, as in Campsite.
	function sendOnModEnter(event: KeyboardEvent) {
		if (!isModEnter(event)) return;
		event.preventDefault();
		event.stopPropagation();
		if (!empty) (event.currentTarget as HTMLFormElement).requestSubmit();
	}

	function cancel() {
		if (inline && !empty) discarding = true;
		// An empty inline box has only its focus to give up, which folds its controls away.
		else if (inline) (document.activeElement as HTMLElement).blur();
		else oncancel?.();
	}

	function discard() {
		discarding = false;
		draft = null;
		draftKey++;
		empty = true;
		message = null;
		oncancel?.();
	}
</script>

<!-- ⌘ or Ctrl+Enter sends from any field in it. -->
<form
	method="POST"
	{action}
	class="comment-form l:waterfall"
	data-inline={inline || undefined}
	use:enhance={submit}
	onkeydowncapture={sendOnModEnter}
>
	{#if sent && !listed.includes(sent.id)}
		<div class="sent"><RichText doc={sent.doc} {customEmoji} /></div>
	{/if}
	{#if replyTo}<input type="hidden" name="replyTo" value={replyTo} />{/if}
	{#if commentId}<input type="hidden" name="commentId" value={commentId} />{/if}
	{#if pin}
		<input type="hidden" name="attachmentId" value={pin.attachmentId} />
		<input type="hidden" name="x" value={pin.x} />
		<input type="hidden" name="y" value={pin.y} />
	{/if}
	{#if passage}
		<input type="hidden" name="anchorStart" value={passage.start} />
		<input type="hidden" name="anchorEnd" value={passage.end} />
	{/if}
	<div class="box" data-empty={empty || undefined}>
		{#if inline && page.data.user}
			<span class="me"
				><Avatar name={page.data.user.name} src={page.data.user.avatarUrl} size="sm" /></span
			>
		{/if}
		{#key draftKey}
			<Editor
				name="body"
				compact
				formatting={false}
				toolbarLast
				checklists
				value={draft}
				{placeholder}
				{members}
				{uploadUrl}
				{resetKey}
				onupdate={(doc) => (empty = isEmptyDoc(doc))}
			/>
		{/key}
		<div class="actions">
			<SuedeButton type="submit" disabled={empty}>{submitLabel}</SuedeButton>
			{#if oncancel || inline}
				<Button variant="flat" onclick={cancel}>{s.cancel}</Button>
			{/if}
		</div>
	</div>
	{#if message}<p class="error" role="alert">{message}</p>{/if}
</form>

{#if inline}
	<Dialog bind:open={discarding} title={s.discardTitle} description={s.discardQuestion} size="sm">
		{#snippet actions()}
			<Button onclick={() => (discarding = false)}>{s.cancel}</Button>
			<Button variant="danger" onclick={discard}>{s.discard}</Button>
		{/snippet}
	</Dialog>
{/if}

<style>
	.comment-form {
		--waterfall-gap: var(--gap-sm);
	}

	/* Your comment on its way: its text in the muted colour until the list shows it. */
	.sent {
		padding-inline: var(--gap-md);
		color: var(--hue-z0-muted);
	}

	/* Campsite's comment box: one raised card holding the editor and its controls. The text sits
	   on top; the formatting tools and the submit button share a row along the bottom. The
	   editor's own box is dissolved (display: contents) so its parts join this grid. */
	.box {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas:
			'content content'
			'note note'
			'toolbar actions';
		border-radius: var(--radius-surface);
		background-color: var(--hue-z2-bg);
		box-shadow:
			0 1px 2px 0 light-dark(rgb(0 0 0 / 0.05), rgb(0 0 0 / 0.2)),
			0 0 0 var(--border-w-hairline) var(--hue-z0-border);
	}

	.box :global(.editor) {
		display: contents;
	}

	/* The box is the field: while it holds focus, a tap included, its hairline darkens a step. */
	.box:focus-within {
		box-shadow:
			0 1px 2px 0 light-dark(rgb(0 0 0 / 0.05), rgb(0 0 0 / 0.2)),
			0 0 0 var(--border-w-thin) var(--hue-field-edge-focus);
	}

	.box :global(.editor .content) {
		grid-area: content;
		min-block-size: 3rem;
		padding: 0.625rem var(--gap-md);
	}

	/* A phone: the text scrolls inside the box at 40% of what's visible, so the footer under it
	   can never be pushed off screen (Campsite's maxHeight 40vh). */
	@media (max-width: 39.99rem) {
		.box :global(.editor .content) {
			max-block-size: calc(var(--visual-h) * 0.4);
			overflow-y: auto;
		}
	}

	.box :global(.editor .note) {
		grid-column: 1 / -1;
		padding-inline: var(--gap-md);
	}

	.box :global(.editor .toolbar) {
		grid-area: toolbar;
		align-self: end;
		gap: 0.125rem;
		padding: var(--gap-sm) 0 var(--gap-md) 0.375rem;
		border: 0;
	}

	.box :global(.editor .tool) {
		color: var(--hue-z0-muted);
	}

	/* Campsite's inline reply (§2.4): a row of the thread card, not a box. Avatar beside the
	   text, the tools and buttons under it, shown once the reply has focus or text. */
	[data-inline] .box {
		grid-template-columns: auto minmax(0, 1fr) auto;
		grid-template-areas:
			'me content content'
			'me note note'
			'me toolbar actions';
		column-gap: var(--gap-md);
		padding: var(--gap-md);
		border-radius: 0;
		background: none;
		box-shadow: none;
	}

	[data-inline] .box:focus-within {
		box-shadow: none;
	}

	.me {
		grid-area: me;
		align-self: start;
		display: flex;
	}

	[data-inline] .box :global(.editor .content) {
		min-block-size: 0;
		padding: 0;
	}

	[data-inline] .box :global(.editor .toolbar) {
		padding: var(--gap-md) 0 0;
		margin-inline-start: -0.375rem;
	}

	[data-inline] .actions {
		padding: var(--gap-md) 0 0;
	}

	[data-inline] .box[data-empty]:not(:focus-within) :global(.editor .toolbar),
	[data-inline] .box[data-empty]:not(:focus-within) .actions {
		display: none;
	}

	.error {
		margin: 0;
		color: var(--hue-danger);
	}

	.actions {
		grid-area: actions;
		align-self: end;
		display: flex;
		flex-direction: row-reverse;
		gap: var(--gap-sm);
		align-items: center;
		padding: var(--gap-sm) var(--gap-md) var(--gap-md) var(--gap-sm);
	}
</style>
