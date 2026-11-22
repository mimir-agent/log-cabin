<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import Avatar from '#lib/components/shell/Avatar.svelte';
	import Editor from '#lib/components/editor/Editor.svelte';
	import SuedeButton from '#lib/components/ui/SuedeButton.svelte';
	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { isEmptyDoc, type DocNode } from '#lib/editor/doc.js';
	import type { Member } from '#lib/components/editor/extensions.js';
	import { posts } from '#lib/strings/posts.js';

	type Props = {
		/** The project the post goes to, shown where Campsite has its channel picker. */
		projectName: string;
		title: string;
		body: DocNode | null;
		members: Member[];
		uploadUrl: string;
		submitLabel: string;
		/** A status in the card's head, such as whether the draft is saved. */
		hint?: string;
		cancelHref?: string;
		message?: string | null;
		/** The post is on its way: Post can't be pressed again, and a spinner shows if it takes a while. */
		busy?: boolean;
		ontitle?: (title: string) => void;
		onbody?: (doc: DocNode) => void;
		/** Parts of the post below its body, such as a poll. */
		children?: Snippet;
		/** Takes the project chip's place: the dialog's project picker. */
		project?: Snippet;
		/** Buttons at the head's right end, as Campsite's Expand and Close. */
		tools?: Snippet;
		/** A button before Post, such as Save draft; told whether there's anything to keep. */
		secondary?: Snippet<[{ empty: boolean }]>;
	};

	const {
		projectName,
		title,
		body,
		members,
		uploadUrl,
		submitLabel,
		hint,
		cancelHref,
		message,
		busy = false,
		ontitle,
		onbody,
		children,
		project,
		tools,
		secondary
	}: Props = $props();

	const s = posts.composer;

	// The server needs a title, so Post stays disabled until there is one, and says so once there is
	// something to post. Campsite's subject is optional; ours is not (the feed, inbox and mail all
	// name a post by it). Bound, so a title typed before the page is live survives hydration;
	// onMount then passes it on, since no input event did.
	let subject = $state(untrack(() => title));
	const canPost = $derived(subject.trim() !== '');
	let bodyEmpty = $state(untrack(() => !body || isEmptyDoc(body)));
	onMount(() => {
		if (subject !== title) ontitle?.(subject);
	});

	let card: HTMLElement;
	// Enter in the subject goes on to the body, as in Campsite, rather than sending the form.
	function toBody(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.isComposing) return;
		event.preventDefault();
		card.querySelector<HTMLElement>('.ProseMirror')?.focus();
	}
</script>

<!--
	The post composer's card, after Campsite's PostComposerForm (CC BY-NC 4.0, Campsite
	Software Co.): the project on top, a borderless subject and body, the tools and the
	actions along the bottom. The editor's own box is dissolved (display: contents) so its
	parts take places in this grid. Formatting comes from the menu over selected text.
-->
<div class="composer">
	<div class="composer-card" bind:this={card}>
		<header class="head">
			{#if project}
				{@render project()}
			{:else}
				<span class="project">
					<Avatar name={projectName} size="xs" shape="square" />
					<span class="project-name">{projectName}</span>
				</span>
			{/if}
			{#if hint}<p class="hint" role="status">{hint}</p>{/if}
			{#if tools}<div class="tools">{@render tools()}</div>{/if}
		</header>
		{#if message}
			<p class="alert" role="alert">{message}</p>
		{:else if !canPost && !bodyEmpty}
			<p class="alert why" role="status">{s.titleNeeded}</p>
		{/if}
		<label class="subject">
			<span class="u:visually-hidden">{s.title}</span>
			<input
				name="title"
				required
				maxlength="200"
				autocomplete="off"
				placeholder={s.titlePlaceholder}
				bind:value={subject}
				oninput={() => ontitle?.(subject)}
				onkeydown={toBody}
			/>
		</label>
		<Editor
			name="body"
			post
			checklists
			slash
			bubble
			value={body}
			placeholder={s.bodyPlaceholder}
			{members}
			{uploadUrl}
			toolbarLast
			onupdate={(doc) => {
				bodyEmpty = isEmptyDoc(doc);
				onbody?.(doc);
			}}
		/>
		{#if children}<div class="extras">{@render children()}</div>{/if}
		<div class="actions">
			{#if cancelHref}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolved hrefs -->
				<a class="cancel" href={cancelHref}>{s.cancel}</a>
			{/if}
			{@render secondary?.({ empty: !canPost && bodyEmpty })}
			<SuedeButton type="submit" disabled={!canPost || busy} aria-busy={busy || undefined}>
				{#if busy}<span class="busy"><Spinner label={s.posting} /></span>{/if}
				{submitLabel}
			</SuedeButton>
		</div>
	</div>
</div>

<style>
	/* Campsite's dialog at size 2xl: 672px, 12px gutters, 15px semibold subject. No container
	   query here: containment would pin the selection menu (position: fixed) to this box. */
	.composer {
		max-inline-size: 42rem;
		margin-inline: auto;
	}

	.composer-card {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-rows: auto auto auto 1fr auto auto auto;
		grid-template-areas:
			'head head'
			'alert alert'
			'subject subject'
			'content content'
			'extras extras'
			'note note'
			'toolbar actions';
		overflow: hidden;
		border-radius: var(--radius-card);
		background-color: var(--hue-z2-bg);
		box-shadow: var(--elevation-dialog);
		color: var(--hue-z2-fg);
		font-size: var(--type-body);
	}

	.composer-card :global(.editor) {
		display: contents;
	}

	.head {
		grid-area: head;
		display: flex;
		gap: var(--gap-md);
		align-items: center;
		justify-content: space-between;
		padding: var(--gap-md) var(--gap-md) 0.625rem;
	}

	/* Where the draft is kept: a status, so it sits quietly up top beside Campsite's window
	   buttons, and leaves the bottom row to the tools and Post. */
	.hint {
		flex: 1;
		min-inline-size: 0;
		margin: 0;
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
		line-height: var(--leading-ui);
		text-align: end;
	}

	/* Campsite's header actions: 30px plain icon buttons, 2px apart, right of everything. */
	.tools {
		display: flex;
		gap: 0.125rem;
		align-items: center;
		margin-block: -0.25rem;
	}

	/* The project, where Campsite has its channel picker: a small raised chip. It isn't a
	   picker here, so it carries no chevron. */
	.project {
		display: inline-flex;
		gap: 0.375rem;
		align-items: center;
		max-inline-size: 100%;
		min-inline-size: 0;
		block-size: var(--control-h-xs);
		padding-inline: 0.25rem var(--gap-sm);
		border-radius: var(--radius-xs, 0.25rem);
		background-color: light-dark(var(--hue-white), var(--hue-gray-750));
		box-shadow: var(--shadow-button);
		font-size: 0.8125rem;
		font-weight: var(--fw-medium);
		line-height: var(--leading-ui);
	}

	.project-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.alert {
		grid-area: alert;
		margin: 0;
		padding: 0 var(--gap-md) var(--gap-sm);
		color: var(--hue-danger);
	}

	.why {
		color: var(--hue-z0-muted);
	}

	.subject {
		grid-area: subject;
		display: grid;
		padding-inline: var(--gap-md);
	}

	/* The subject sits on the body's line, so both start at the same edge. The full-size
	   composer is wider than a line, so it centres that line in its panel. */
	.subject input {
		inline-size: 100%;
		max-inline-size: var(--measure-prose);
		padding: var(--gap-xs) 0 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--type-prose);
		font-weight: var(--fw-semibold);
		line-height: 1.375;
	}

	.subject input::placeholder,
	.composer-card :global(.prose p.is-editor-empty:first-child::before) {
		color: var(--hue-z0-muted);
	}

	.composer-card :global(.editor .content) {
		grid-area: content;
		min-block-size: 8rem;
		padding: var(--gap-xs) var(--gap-md) var(--gap-sm);
		cursor: text;
	}

	:global([data-fill]) .subject input,
	:global([data-fill]) .composer-card :global(.editor .ProseMirror) {
		inline-size: 100%;
		margin-inline: auto;
	}

	.composer-card :global(.editor .note) {
		grid-area: note;
		padding-inline: var(--gap-md);
	}

	.extras {
		grid-area: extras;
		padding: 0 var(--gap-md) var(--gap-sm);
	}

	/* Campsite keeps files, emoji and GIF bottom left; formatting is in the selection menu. */
	.composer-card :global(.editor .toolbar:not(.bubble)) {
		grid-area: toolbar;
		align-self: end;
		gap: 0.125rem;
		padding: 0.375rem 0 var(--gap-md) 0.375rem;
		border: 0;
	}

	.actions {
		grid-area: actions;
		align-self: end;
		display: flex;
		gap: var(--gap-sm);
		align-items: center;
		justify-content: flex-end;
		padding: 0.375rem 0.625rem var(--gap-md) var(--gap-sm);
	}

	/* The spinner inside Post waits a moment, so a quick post never flashes one. */
	.busy {
		display: inline-flex;
		color: inherit;
		animation: after-a-wait var(--motion-instant) var(--motion-delay-progress) backwards;
	}

	.busy :global(.spinner) {
		color: inherit;
	}

	/* Firefox, and Safari before 18, don't animate display; for them the spinner keeps its
	   room but stays hidden. */
	@keyframes after-a-wait {
		from,
		to {
			display: none;
			visibility: hidden;
		}
	}

	.cancel {
		display: inline-flex;
		align-items: center;
		block-size: var(--control-h-sm);
		padding-inline: 0.625rem;
		border-radius: var(--radius-control);
		color: var(--hue-z0-fg);
		font-weight: var(--fw-medium);
		line-height: var(--leading-ui);
		text-decoration: none;
	}

	.cancel:hover {
		background-color: var(--hue-fill);
	}

	/* A phone: the edit page's header back arrow already leaves without saving. */
	@media (max-width: 39.99rem) {
		.cancel {
			display: none;
		}
	}
</style>
