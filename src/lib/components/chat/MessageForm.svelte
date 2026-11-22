<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Editor from '#lib/components/editor/Editor.svelte';
	import { isModEnter } from '#lib/components/editor/keys.js';
	import Icon from '#lib/components/ui/Icon.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import { attachmentPath, isEmptyDoc, type DocNode } from '#lib/editor/doc.js';
	import { fileNode, uploadFile, type Uploaded } from '#lib/editor/upload.js';
	import { chat } from '#lib/strings/chat.js';
	import { editor as editorText } from '#lib/strings/editor.js';

	type Props = {
		action: '?/send' | '?/edit';
		replyTo?: string;
		messageId?: string;
		value?: DocNode | null;
		members: { id: string; name: string }[];
		uploadUrl: string;
		submitLabel: string;
		oncancel?: () => void;
		/** Called after the server accepts the message, e.g. to close an inline edit. */
		onsaved?: () => void;
		/** Called as the person types, for the typing indicator. */
		ontyping?: () => void;
		/** Takes over sending a message with something in it: the form clears at once. */
		onsend?: (data: FormData) => void;
		/** ArrowUp in the empty box: edit your last message. */
		onemptyarrowup?: () => void;
	};

	const {
		action,
		replyTo,
		messageId,
		value = null,
		members,
		uploadUrl,
		submitLabel,
		oncancel,
		onsaved,
		ontyping,
		onsend,
		onemptyarrowup
	}: Props = $props();

	let form: HTMLFormElement;
	let editor: ReturnType<typeof Editor>;
	let resetKey = $state(0);
	let message = $state<string | null>(null);

	// Files wait in a strip above the text, outside it, so typing can't replace one (Campsite's
	// Attachments). Sending puts them after the text in the message's document. Editing a
	// message keeps its files in its text.
	type Waiting = { key: number; name: string; uploaded: Uploaded | null };
	let files = $state<Waiting[]>([]);
	let fileErrors = $state<string[]>([]);
	let nextKey = 0;

	async function addFile(file: File) {
		const key = nextKey++;
		files.push({ key, name: file.name, uploaded: null });
		try {
			const uploaded = await uploadFile(uploadUrl, file);
			const waiting = files.find((f) => f.key === key);
			if (waiting) waiting.uploaded = uploaded;
		} catch (error) {
			files = files.filter((f) => f.key !== key);
			fileErrors = [...fileErrors, editorText.uploadFailed(file.name, (error as Error).message)];
		}
	}

	function addFiles(list: FileList) {
		fileErrors = [];
		// The list empties when the file input is reset, so take its files now.
		for (const file of [...list]) void addFile(file);
	}

	/** Files dropped or pasted anywhere on the thread page. */
	export const attach = (list: FileList) => (oncancel ? editor.attach(list) : addFiles(list));
	/** Text pasted while nothing had focus goes to the end of the box. */
	export const pasteText = (value: string) => editor.pasteText(value);

	// Campsite greys the send button out until there's something to send.
	const hasContent = (doc: DocNode | null): boolean =>
		!!doc &&
		(doc.type === 'text'
			? !!doc.text?.trim()
			: doc.type !== 'doc' && doc.type !== 'paragraph'
				? true
				: (doc.content ?? []).some(hasContent));
	let filled = $state(untrack(() => hasContent(value)));
	// Text or files are enough to send, once every file has finished uploading.
	const canSend = $derived((filled || files.length > 0) && files.every((f) => f.uploaded));

	// Opening an edit brings its Save and Cancel above the thread's sticky composer bar.
	onMount(() => {
		if (oncancel) form.scrollIntoView({ block: 'nearest' });
	});

	function sendOnModEnter(event: KeyboardEvent) {
		if (!isModEnter(event)) return;
		event.preventDefault();
		event.stopPropagation();
		if (canSend) form.requestSubmit();
	}
</script>

<!-- ⌘ or Ctrl+Enter sends from any field in it. -->
<form
	bind:this={form}
	method="POST"
	{action}
	class="message-form"
	data-mode={oncancel ? 'edit' : 'send'}
	onkeydowncapture={sendOnModEnter}
	use:enhance={({ formData, cancel }) => {
		if (files.length) {
			const doc = JSON.parse(String(formData.get('body'))) as DocNode;
			const content = [...(doc.content ?? []), ...files.map((f) => fileNode(f.uploaded!))];
			formData.set('body', JSON.stringify({ ...doc, content }));
		}
		// An empty message goes to the server, which says what's missing.
		if (onsend && !isEmptyDoc(JSON.parse(String(formData.get('body'))))) {
			cancel();
			onsend(formData);
			message = null;
			resetKey++;
			files = [];
			onsaved?.();
			return;
		}
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				message = String(result.data?.message ?? '');
				return;
			}
			if (result.type === 'success') {
				message = null;
				resetKey++;
				filled = false;
				files = [];
				onsaved?.();
			}
			await update();
		};
	}}
>
	{#if replyTo}<input type="hidden" name="replyTo" value={replyTo} />{/if}
	{#if messageId}<input type="hidden" name="messageId" value={messageId} />{/if}
	<div class="composer" data-files={files.length || undefined}>
		{#if files.length}
			<ul class="strip" data-attachment-strip>
				{#each files as file (file.key)}
					<li aria-busy={!file.uploaded}>
						{#if file.uploaded?.contentType.startsWith('image/')}
							<img src={attachmentPath(file.uploaded.id)} alt={file.name} />
						{:else}
							<span class="file-name">{file.name}</span>
						{/if}
						<button
							type="button"
							class="remove"
							aria-label={chat.thread.removeAttachment}
							title={chat.thread.removeAttachment}
							onclick={() => (files = files.filter((f) => f.key !== file.key))}
						>
							<Icon name="close" size={12} strokeWidth="2.5" />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		<Editor
			bind:this={editor}
			name="body"
			compact
			formatting={false}
			attachIcon="plus"
			{value}
			placeholder={chat.thread.placeholder}
			{members}
			{uploadUrl}
			onfiles={oncancel ? undefined : addFiles}
			{resetKey}
			autofocus={!!oncancel}
			onenter={() => canSend && form.requestSubmit()}
			{onemptyarrowup}
			onupdate={(doc) => {
				filled = hasContent(doc);
				ontyping?.();
			}}
		/>
		{#if oncancel}
			<div class="actions">
				<SuedeButton type="submit">{submitLabel}</SuedeButton>
				<button type="button" class="cancel" onclick={oncancel}>{chat.thread.cancel}</button>
			</div>
		{:else}
			<button
				type="submit"
				class="send"
				data-tap
				aria-label={submitLabel}
				title={submitLabel}
				disabled={!canSend}
			>
				<Icon name="arrow-up" size={20} strokeWidth="2.5" />
			</button>
		{/if}
	</div>
	{#if message}<p class="error" role="alert">{message}</p>{/if}
	{#each fileErrors as error, i (i)}<p class="error" role="alert">{error}</p>{/each}
</form>

<style>
	/* Campsite's chat composer: the attach button outside on the left, then an 18px-round pill
	   holding the text, with a round send button tucked into its bottom-right corner. Chat has
	   no formatting row; Markdown and the keyboard shortcuts still format. The editor's own
	   box is dissolved (display: contents) so its parts join this grid. */
	.composer {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-areas:
			'. strip'
			'tools content'
			'. note';
		column-gap: var(--gap-sm);
		align-items: end;
	}

	.composer :global(.editor) {
		display: contents;
	}

	.composer :global(.editor .toolbar) {
		grid-area: tools;
		padding: 0 0 0.0625rem;
		border: 0;
	}

	/* Chat has no formatting row (formatting={false}), so the toolbar is the attach button alone:
	   Campsite's 34px round plus. */
	.composer :global(.editor .toolbar > .tool) {
		display: grid;
		place-items: center;
		inline-size: 2.125rem;
		block-size: 2.125rem;
		padding: 0;
		border-radius: var(--radius-full);
	}

	.composer :global(.editor .toolbar > .tool .icon) {
		inline-size: 1.5rem;
		block-size: 1.5rem;
	}

	/* On a phone the attach button is a full tap target; the send button inside the pill keeps
	   its size and gets its reach from data-tap: no control lies close enough to it. */
	@media (pointer: coarse) {
		.composer :global(.editor .toolbar > .tool) {
			block-size: var(--tap-min);
		}
	}

	.composer :global(.editor .content) {
		grid-area: content;
		min-block-size: 2.25rem;
		max-block-size: 40vh;
		padding: 0.4375rem 2.75rem 0.4375rem var(--gap-md);
		overflow-y: auto;
		border-radius: 1.125rem;
		background-color: var(--hue-z2-bg);
		box-shadow: 0 0 0 var(--border-w-hairline) var(--hue-z0-border);
	}

	/* Files waiting to send sit in the top of the same pill, above the text. */
	.strip {
		display: flex;
		grid-area: strip;
		flex-wrap: wrap;
		gap: var(--gap-sm);
		margin: 0;
		padding: var(--gap-sm) var(--gap-md) 0;
		list-style: none;
		border-radius: 1.125rem 1.125rem 0 0;
		background-color: var(--hue-z2-bg);
		box-shadow: 0 0 0 var(--border-w-hairline) var(--hue-z0-border);
	}

	.composer[data-files] :global(.editor .content) {
		border-start-start-radius: 0;
		border-start-end-radius: 0;
	}

	.strip li {
		position: relative;
		display: grid;
		place-items: center;
		min-inline-size: 2.5rem;
		block-size: 5rem;
		border-radius: 0.75rem;
		background-color: var(--hue-z1-bg);
		box-shadow: 0 0 0 var(--border-w-hairline) var(--hue-z0-border);
	}

	.strip img {
		inline-size: auto;
		max-inline-size: 5rem;
		block-size: 100%;
		border-radius: inherit;
		object-fit: cover;
	}

	.file-name {
		max-inline-size: 8rem;
		padding: 0 var(--gap-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.remove {
		position: absolute;
		inset-block-start: -0.375rem;
		inset-inline-end: -0.375rem;
		display: grid;
		place-items: center;
		inline-size: 1.25rem;
		block-size: 1.25rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-full);
		background-color: var(--hue-z0-fg);
		color: var(--hue-z0-bg);
		cursor: pointer;
	}

	.composer :global(.editor .note) {
		grid-area: note;
	}

	/* 16px text below 1024px, as Campsite's composer, which also keeps iOS from zooming in on
	   focus; the pill's padding tightens by a pixel so it stays 36px tall. */
	@media (max-width: 63.99rem) {
		.composer :global(.editor .content) {
			padding-block: 0.375rem;
		}

		.composer :global(.editor .content .prose) {
			font-size: 1rem;
			line-height: 1.5rem;
		}
	}

	.send {
		/* ProseMirror is positioned, so it paints over an unpositioned button wherever the two
		   overlap; the button stays on top of the text and of a picture in it. */
		position: relative;
		z-index: 1;
		display: grid;
		grid-area: content;
		justify-self: end;
		place-items: center;
		inline-size: 1.75rem;
		block-size: 1.75rem;
		margin: 0.25rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-full);
		background-color: var(--hue-accent);
		color: var(--hue-accent-fg);
		cursor: pointer;
		transition: background-color var(--motion-fast) var(--motion-ease);
	}

	.send:hover:not(:disabled) {
		background-color: var(--hue-accent-hover);
	}

	/* Campsite's disabled button: the same ink at half strength. */
	.send:disabled {
		opacity: 0.5;
		cursor: default;
	}

	/* Editing a message: the same box, Save and Cancel under it. */
	/* The thread page sets --composer-bar-h to its sticky bar's measured height, safe area
	   included, so scrolling the form into view stops above the bar. */
	[data-mode='edit'] {
		scroll-margin-block-end: var(--composer-bar-h, 0px);
	}

	[data-mode='edit'] .composer {
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: 'content' 'note' 'actions';
		row-gap: var(--gap-sm);
	}

	[data-mode='edit'] .composer :global(.editor .toolbar) {
		display: none;
	}

	[data-mode='edit'] .composer :global(.editor .content) {
		padding-inline-end: var(--gap-md);
	}

	.error {
		margin: var(--gap-xs) 0 0;
		color: var(--hue-danger);
	}

	.actions {
		display: flex;
		grid-area: actions;
		gap: var(--gap-xs);
		align-items: center;
	}

	.cancel {
		padding: var(--gap-sm) var(--gap-md);
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: var(--leading-ui);
		cursor: pointer;
	}

	/* Save is SuedeButton, which is tap-min tall on touch; Cancel matches it, and the two keep
	   a full gap between their targets. */
	@media (pointer: coarse) {
		.actions {
			gap: var(--gap-sm);
		}

		.cancel {
			min-block-size: var(--tap-min);
		}
	}

	.cancel:hover {
		background-color: var(--hue-hover);
		color: var(--hue-z0-fg);
	}
</style>
