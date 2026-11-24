<script lang="ts">
	import { page } from '$app/state';
	import { untrack, type Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import type { Member } from '#lib/components/editor/extensions.js';
	import { isModEnter } from '#lib/components/editor/keys.js';
	import Button from '#lib/components/ui/Button.svelte';
	import { toast } from '#lib/components/ui/Toast.svelte';
	import type { DocNode } from '#lib/editor/doc.js';
	import { failureText } from '#lib/forms/submit.js';
	import { notes } from '#lib/strings/notes.js';
	import { posts } from '#lib/strings/posts.js';
	import ComposerCard from './ComposerCard.svelte';
	import PollEditor from './PollEditor.svelte';
	import ProjectPicker from './ProjectPicker.svelte';

	type Poll = { question: string; options: { description: string }[] };
	type Draft = { id: string; title: string; body: DocNode; poll: Poll | null; updatedAt: number };
	type Props = {
		projectId: string;
		projectName: string;
		members: Member[];
		/** The message a post is started from (Start a post…): its words and files to begin with. */
		fromMessage?: { id: string; body: DocNode };
		/** The doc a post shares (Share in a thread…): its link card to begin with. */
		shareDoc?: { id: string; title: string; inChannel: boolean };
		/** The saved draft this composer continues, if any. */
		draft?: Draft;
		message?: string;
		/** Where it publishes: the page's own action unless given. */
		action?: string;
		/** The new-post dialog's picker: the projects the post can go to, and the picked one's guests. */
		picker?: { projects: { id: string; name: string; accessory: string | null }[]; guests: number };
		onproject?: (id: string) => void;
		/** Buttons at the head's right end. */
		tools?: Snippet;
		/** Published: called with the post's address instead of going there. */
		onpublished?: (href: string) => void;
		/** Shows Save draft, which saves at once and then calls this. */
		onkept?: () => void;
	};
	const {
		projectId,
		projectName,
		members,
		draft,
		fromMessage,
		shareDoc,
		message,
		action = '?/publish',
		picker,
		onproject,
		tools,
		onpublished,
		onkept
	}: Props = $props();
	const s = posts.composer;
	const d = posts.drafts;
	/** How long typing must pause before the draft saves. */
	const idleMs = 2000;

	/** A paragraph holding a link to the doc, which the reader sees as its card (NoteLinkCard). */
	function docCard({ id, title }: { id: string; title: string }): DocNode {
		const link = { type: 'link', attrs: { href: `${page.url.origin}/notes/${id}` } };
		const text = { type: 'text', text: title, marks: [link] };
		return { type: 'doc', content: [{ type: 'paragraph', content: [text] }] };
	}

	let title = $state(untrack(() => draft?.title ?? ''));
	let body = $state.raw<DocNode | null>(
		untrack(() => draft?.body ?? fromMessage?.body ?? (shareDoc && docCard(shareDoc)) ?? null)
	);
	let poll = $state.raw<Poll | null>(untrack(() => draft?.poll ?? null));
	let draftId = $state(untrack(() => draft?.id ?? null));
	let savedAt = $state(untrack(() => draft?.updatedAt ?? null));
	let saving = $state(false);
	let saveError = $state('');
	/** Why the server refused the last publish; the dialog has no page form to show it. */
	let refused = $state('');
	let busy = $state(false);

	let timer: ReturnType<typeof setTimeout> | undefined;
	// Saves run one after another, so the first one's new draft id is known to the next.
	let queue = Promise.resolve();

	function changed() {
		clearTimeout(timer);
		timer = setTimeout(() => (queue = queue.then(save)), idleMs);
	}

	/**
	 * Saves a change still waiting for its pause and answers whether a draft exists. The dialog
	 * calls it on Save draft and on closing, so closing never loses what was typed.
	 */
	export async function keep() {
		if (timer) {
			clearTimeout(timer);
			queue = queue.then(save);
		}
		await queue;
		return draftId !== null;
	}

	// Never rejects, so one failed save (offline, say) can't stop the saves after it or publishing.
	async function save() {
		timer = undefined;
		saving = true;
		try {
			await send();
		} catch (error) {
			saveError = d.saveFailed((error as Error).message);
		} finally {
			saving = false;
		}
	}

	async function send() {
		const content = {
			projectId,
			title,
			body: JSON.stringify(body ?? { type: 'doc' }),
			poll: poll && JSON.stringify(poll)
		};
		const response = draftId
			? await fetch(`/drafts/${draftId}`, { method: 'PUT', body: JSON.stringify(content) })
			: await fetch('/drafts', { method: 'POST', body: JSON.stringify(content) });
		if (!response.ok) {
			const failure = await response.json().catch(() => ({ message: response.statusText }));
			saveError = d.saveFailed((failure as { message: string }).message);
			return;
		}
		const saved = (await response.json()) as { id?: string; updatedAt: number };
		saveError = '';
		savedAt = saved.updatedAt;
		if (saved.id) draftId = saved.id;
	}

	// ⌘ or Ctrl with Enter posts from anywhere in the form, as in Campsite.
	function postOnModEnter(event: KeyboardEvent & { currentTarget: HTMLFormElement }) {
		if (!isModEnter(event)) return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.querySelector<HTMLButtonElement>('button[type=submit]:enabled')?.click();
	}
</script>

{#snippet projectPicker()}
	{#if picker}
		<ProjectPicker
			projects={picker.projects}
			value={projectId}
			startOpen={shareDoc && !shareDoc.inChannel}
			guests={picker.guests}
			onchange={(id) => {
				onproject?.(id);
				if (draftId) changed();
			}}
		/>
	{/if}
{/snippet}

{#snippet saveDraft({ empty }: { empty: boolean })}
	<Button
		variant="ghost"
		disabled={empty || busy}
		onclick={async () => {
			await keep();
			onkept?.();
		}}>{s.saveDraft}</Button
	>
{/snippet}

<!-- ⌘ or Ctrl+Enter sends from any field in it. -->
<form
	method="POST"
	{action}
	use:enhance={async ({ formData }) => {
		// A save still waiting would bring the draft back after it's published.
		clearTimeout(timer);
		await queue;
		formData.set('draftId', draftId ?? '');
		if (fromMessage) formData.set('fromMessageId', fromMessage.id);
		if (shareDoc) formData.set('sharedNoteId', shareDoc.id);
		refused = '';
		busy = true;
		return async ({ result, update }) => {
			// A lost connection keeps the page, with the draft, and says so.
			if (result.type === 'error') {
				busy = false;
				toast(failureText(result));
				return;
			}
			if (result.type === 'redirect' && onpublished) {
				onpublished(result.location);
				return;
			}
			if (result.type === 'failure') refused = String(result.data?.message ?? '');
			await update();
			busy = false;
		};
	}}
	onkeydowncapture={postOnModEnter}
>
	<ComposerCard
		{projectName}
		{title}
		{body}
		{busy}
		{members}
		{tools}
		project={picker && projectPicker}
		secondary={onkept && saveDraft}
		uploadUrl={`/projects/${projectId}/attachments`}
		submitLabel={s.submit}
		hint={saveError ||
			(saving ? d.saving : savedAt ? d.saved(savedAt, page.data.timeZone) : d.notSaved)}
		message={refused || message}
		focusTitle={!!shareDoc}
		ontitle={(value) => {
			title = value;
			changed();
		}}
		onbody={(doc) => {
			body = doc;
			changed();
		}}
	>
		{#if shareDoc && !shareDoc.inChannel}
			<p class="adds">{notes.sharePost.adds}</p>
		{/if}
		<PollEditor
			value={poll}
			onchange={(value) => {
				poll = value;
				changed();
			}}
		/>
	</ComposerCard>
</form>

<style>
	/* What posting does to the doc, in the quiet type of the card's other notes. */
	.adds {
		margin: 0;
		padding-inline: var(--gap-md);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}
</style>
