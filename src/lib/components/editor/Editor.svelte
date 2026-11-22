<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { innerWidth } from 'svelte/reactivity/window';
	import { Editor, type ChainedCommands } from '@tiptap/core';
	import type { EditorView } from '@tiptap/pm/view';
	import { TextSelection } from '@tiptap/pm/state';
	import { Popover, Toolbar } from 'bits-ui';
	import { docImages, type DocNode, type ResourceTitles } from '#lib/editor/doc.js';
	import { fileNode, uploadFile } from '#lib/editor/upload.js';
	import { linkHref } from '#lib/editor/extensions.js';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import UiPopover from '#lib/components/ui/Popover.svelte';
	import Tooltip from '#lib/components/ui/Tooltip.svelte';
	import type { IconName } from '#lib/components/ui/icons/campsite-icons.js';
	import { editor as text } from '#lib/strings/editor.js';
	import {
		chatKeys,
		editorExtensions,
		findResources,
		linkKey,
		mentionSuggestion,
		slashMenu,
		type Member
	} from './extensions.js';
	import { Gallery } from './gallery.js';
	import Lightbox from './Lightbox.svelte';
	import NoteLinkCard from '#lib/components/notes/NoteLinkCard.svelte';
	import type { AnyExtension } from '@tiptap/core';

	type Props = {
		name: string;
		value?: DocNode | null;
		compact?: boolean;
		/** A note's document: prose at 16px with Campsite's larger note headings. */
		note?: boolean;
		/**
		 * The formatting buttons and the link popover. Campsite's comment box has none: its footer
		 * holds attachments only, and formatting comes from Markdown and the usual shortcuts.
		 */
		formatting?: boolean;
		/**
		 * Formatting comes from a small menu over selected text, as in Campsite's post
		 * composer, and the toolbar keeps only its other tools.
		 */
		bubble?: boolean;
		/**
		 * Put the toolbar after the text in the DOM, for boxes that show their tools along the
		 * bottom, so tabbing goes text first, then tools, as it reads.
		 */
		toolbarLast?: boolean;
		/** The attach button's icon: a picture for posts and comments, a plus in chat. */
		attachIcon?: IconName;
		/** Allows checklists, from the Checklist tool or by typing "[ ] "; only where a tick is saved. */
		checklists?: boolean;
		/** Opens the `/` menu of blocks, in the boxes that hold a whole document (posts, notes). */
		slash?: boolean;
		placeholder: string;
		members: Member[];
		uploadUrl?: string;
		/** Takes the files attached, dropped or pasted instead of the text (chat's strip of files). */
		onfiles?: (files: FileList) => void;
		onupdate?: (doc: DocNode) => void;
		/** Puts the cursor at the end on opening, as an inline edit does. */
		autofocus?: boolean;
		/** Enter sends (chat): called in place of starting a new paragraph. */
		onenter?: () => void;
		/** ArrowUp in an empty box (chat: edit your last message). */
		onemptyarrowup?: () => void;
		disabled?: boolean;
		/** Clears the editor whenever this changes, e.g. after a successful submit. */
		resetKey?: unknown;
		/**
		 * A note's live-editing extensions (liveExtensions in live-extensions.ts): the editor shows
		 * and edits the shared document instead of `value`.
		 */
		live?: AnyExtension[];
		/**
		 * Lays out two or more images in a row as a gallery and opens a clicked image in the
		 * lightbox over the document's images, as RichText shows a saved body.
		 */
		gallery?: boolean;
		/** Draws the lightbox's image, e.g. with comments pinned to it. */
		image?: Snippet<[{ src: string; alt: string }]>;
		/**
		 * In a note, the titles of the notes, posts and calls it mentions that this person may see;
		 * typing @ there also offers notes, posts and calls.
		 */
		resources?: ResourceTitles;
	};

	const {
		name,
		value = null,
		compact = false,
		note = false,
		formatting = true,
		bubble = false,
		toolbarLast = false,
		attachIcon,
		checklists = false,
		slash = false,
		placeholder,
		members,
		uploadUrl,
		onfiles,
		onupdate,
		autofocus = false,
		onenter,
		onemptyarrowup,
		disabled = false,
		resetKey,
		live,
		gallery = false,
		image,
		resources = {}
	}: Props = $props();

	type Tool = {
		label: string;
		glyph: string;
		type: string;
		attrs?: Record<string, unknown>;
		toggle: (chain: ChainedCommands) => ChainedCommands;
	};
	const headings: Tool[] = ([1, 2, 3] as const).map((level) => ({
		label: text.heading(level),
		glyph: text.headingGlyph(level),
		type: 'heading',
		attrs: { level },
		toggle: (chain) => chain.toggleHeading({ level })
	}));
	const bold: Tool = {
		label: text.bold,
		glyph: text.boldGlyph,
		type: 'bold',
		toggle: (c) => c.toggleBold()
	};
	const italic: Tool = {
		label: text.italic,
		glyph: text.italicGlyph,
		type: 'italic',
		toggle: (c) => c.toggleItalic()
	};
	const strike: Tool = {
		label: text.strike,
		glyph: text.strikeGlyph,
		type: 'strike',
		toggle: (c) => c.toggleStrike()
	};
	const code: Tool = {
		label: text.code,
		glyph: text.codeGlyph,
		type: 'code',
		toggle: (c) => c.toggleCode()
	};
	const bulletList: Tool = {
		label: text.bulletList,
		glyph: text.bulletListGlyph,
		type: 'bulletList',
		toggle: (c) => c.toggleBulletList()
	};
	const orderedList: Tool = {
		label: text.orderedList,
		glyph: text.orderedListGlyph,
		type: 'orderedList',
		toggle: (c) => c.toggleOrderedList()
	};
	const taskList: Tool = {
		label: text.taskList,
		glyph: text.taskListGlyph,
		type: 'taskList',
		toggle: (c) => c.toggleTaskList()
	};
	const quote: Tool = {
		label: text.quote,
		glyph: text.quoteGlyph,
		type: 'blockquote',
		toggle: (c) => c.toggleBlockquote()
	};
	const codeBlock: Tool = {
		label: text.codeBlock,
		glyph: text.codeBlockGlyph,
		type: 'codeBlock',
		toggle: (c) => c.toggleCodeBlock()
	};
	const details: Tool = {
		label: text.details.insert,
		glyph: text.details.insertGlyph,
		type: 'details',
		toggle: (c) => (tiptap?.isActive('details') ? c.unsetDetails() : c.setDetails())
	};
	const kbd: Tool = {
		label: text.kbd,
		glyph: text.kbdGlyph,
		type: 'kbd',
		toggle: (c) => c.toggleMark('kbd')
	};
	/** What only a note offers: keyboard keys and collapsible sections. */
	const noteTools = $derived(note ? [kbd, details] : []);
	const tools = $derived(
		compact
			? [bold, italic, code, bulletList, orderedList, ...(checklists ? [taskList] : [])]
			: [
					...headings,
					bold,
					italic,
					strike,
					code,
					bulletList,
					orderedList,
					...(checklists ? [taskList] : []),
					quote,
					codeBlock,
					...noteTools
				]
	);

	let element = $state<HTMLDivElement>();
	let fileInput = $state<HTMLInputElement>();
	let tiptap = $state.raw<Editor>();
	let doc = $state.raw<DocNode>(untrack(() => value) ?? { type: 'doc', content: [] });
	let active = $state<Set<Tool>>(new Set());
	let linkActive = $state(false);
	/** The document's image open in the lightbox, by reading order. */
	let shown = $state<number | null>(null);
	const lightboxImages = $derived(
		docImages(doc).map((node) => ({
			src: String(node.attrs?.src),
			alt: String(node.attrs?.alt ?? '')
		}))
	);

	onMount(() => {
		let instance: Editor | undefined;
		let gone = false;
		const start = (extra: AnyExtension[]) => {
			if (gone) return;
			instance = create(extra);
			tiptap = instance;
			doc = instance.getJSON() as DocNode;
		};
		// A note's own blocks bring every highlighting grammar, so only a note's editor loads them.
		if (note) {
			void import('./note-extensions.js').then((m) =>
				start(m.noteExtensions(() => resources, uploadUrl))
			);
		} else start([]);
		return () => {
			gone = true;
			instance?.destroy();
		};
	});

	function create(extra: AnyExtension[]): Editor {
		return new Editor({
			element: element!,
			extensions: [
				chatKeys({ enter: () => onenter, emptyArrowUp: () => onemptyarrowup }),
				linkKey(openLinkField),
				...editorExtensions({
					placeholder: () => placeholder,
					mentionSuggestion: mentionSuggestion(() => members, note ? findResources : undefined),
					checklists,
					live,
					extra
				}),
				...(slash ? [slashMenu()] : []),
				...(gallery ? [Gallery] : [])
			],
			content: live ? undefined : value,
			editable: !disabled,
			autofocus: autofocus ? 'end' : false,
			editorProps: {
				attributes: () => ({
					'aria-label': placeholder,
					class: 'prose',
					...(compact ? { 'data-size': 'compact' } : note ? { 'data-size': 'note' } : {})
				}),
				handlePaste: (_view, event) => uploadFrom(event.clipboardData?.files),
				handleDrop: (view, event, _slice, moved) => !moved && dropFiles(view, event),
				// Leaves the click to select the image too, so it can still be deleted or dragged.
				handleClickOn: (view, _pos, node, nodePos, _event, direct) => {
					if (gallery && direct && node.type.name === 'image') shown = imageAt(view, nodePos);
				},
				// Images and files drag to move them, but a read-only editor can't drop them.
				handleDOMEvents: {
					dragstart: (view, event) => {
						if (view.editable) return false;
						event.preventDefault();
						return true;
					}
				}
			},
			onTransaction: ({ editor }) => {
				active = new Set(tools.filter((tool) => editor.isActive(tool.type, tool.attrs)));
				linkActive = editor.isActive('link');
				placeBubble(editor);
			},
			onBlur: ({ editor }) => placeBubble(editor),
			onUpdate: ({ editor }) => {
				const json = editor.getJSON() as DocNode;
				doc = json;
				onupdate?.(json);
			}
		});
	}

	$effect(() => tiptap?.setEditable(!disabled, false));

	// A new placeholder (the bottom box turning to a reply) redraws the label and the hint.
	$effect(() => {
		void placeholder;
		untrack(() => tiptap?.view.dispatch(tiptap.state.tr));
	});

	/** Which of the document's images, in reading order (docImages), starts at this position. */
	function imageAt(view: EditorView, at: number): number {
		const starts: number[] = [];
		view.state.doc.descendants((node, pos) => {
			if (node.type.name === 'image') starts.push(pos);
		});
		return starts.indexOf(at);
	}

	let resetSeen = false;
	$effect(() => {
		void resetKey;
		untrack(() => {
			if (resetSeen) tiptap?.commands.clearContent(true);
			resetSeen = true;
		});
	});

	function run(tool: Tool) {
		if (tiptap) tool.toggle(tiptap.chain().focus()).run();
	}

	// Uploads
	let uploading = $state(0);
	let uploadErrors = $state<string[]>([]);

	function uploadFrom(files: FileList | null | undefined): boolean {
		if (!uploadUrl || !files?.length) return false;
		// Chat keeps files outside the text: whoever owns the strip takes them.
		if (onfiles) {
			onfiles(files);
			return true;
		}
		uploadErrors = [];
		for (const file of files) {
			uploading++;
			uploadFile(uploadUrl, file)
				.then((uploaded) => {
					const node = fileNode(uploaded);
					tiptap
						?.chain()
						.focus()
						.insertContent(node)
						// Put the cursor in a paragraph after the new block, adding one if none follows:
						// a selected node would be replaced by the next keystroke or upload.
						.command(({ tr, state }) => {
							const end = tr.selection.to;
							if (!tr.doc.resolve(end).nodeAfter?.isTextblock) {
								tr.insert(end, state.schema.nodes.paragraph.create());
							}
							tr.setSelection(TextSelection.create(tr.doc, end + 1));
							return true;
						})
						.run();
				})
				.catch((error: Error) => {
					uploadErrors = [...uploadErrors, text.uploadFailed(file.name, error.message)];
				})
				.finally(() => uploading--);
		}
		return true;
	}

	function dropFiles(view: EditorView, event: DragEvent): boolean {
		const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
		if (!uploadUrl || !event.dataTransfer?.files.length || !at) return false;
		tiptap?.commands.setTextSelection(at.pos);
		return uploadFrom(event.dataTransfer.files);
	}

	/** Uploads files dropped or pasted outside the box (chat's thread page), at the end. */
	export function attach(files: FileList) {
		tiptap?.commands.focus('end');
		uploadFrom(files);
	}

	/** Text pasted while nothing had focus, added at the end. */
	export function pasteText(value: string) {
		tiptap?.chain().focus('end').insertContent(value).run();
	}

	// The link field, opened over the selection by the Link button or Ctrl/⌘+K, in every editor.
	let linkOpen = $state(false);
	let linkUrl = $state('');
	let linkText = $state('');
	let linkError = $state('');
	/** Nothing is selected, so the field also asks for the words to show. */
	let linkAsksText = $state(false);
	let linkAnchor = $state.raw<{ getBoundingClientRect: () => DOMRect }>();

	function openLinkField() {
		if (!tiptap) return;
		const { from, to, empty } = tiptap.state.selection;
		const start = tiptap.view.coordsAtPos(from);
		const end = tiptap.view.coordsAtPos(to);
		const left = Math.min(start.left, end.left);
		const top = Math.min(start.top, end.top);
		const rect = new DOMRect(
			left,
			top,
			Math.max(start.right, end.right) - left,
			Math.max(start.bottom, end.bottom) - top
		);
		linkAnchor = { getBoundingClientRect: () => rect };
		linkUrl = tiptap.getAttributes('link').href ?? '';
		linkText = '';
		linkError = '';
		linkAsksText = empty && !linkActive;
		linkOpen = true;
	}

	function applyLink(event: SubmitEvent) {
		event.preventDefault();
		const typed = linkUrl.trim();
		const href = linkHref(typed);
		if (!href) {
			linkError = text.linkInvalid;
			return;
		}
		const chain = tiptap!.chain().focus().extendMarkRange('link');
		if (linkAsksText) {
			chain.insertContent({
				type: 'text',
				text: linkText.trim() || typed,
				marks: [{ type: 'link', attrs: { href } }]
			});
		} else {
			chain.setLink({ href });
		}
		chain.run();
		linkOpen = false;
	}

	function removeLink() {
		tiptap?.chain().focus().extendMarkRange('link').unsetLink().run();
		linkOpen = false;
	}

	// The selection menu: over the middle of selected text while the editor has focus, as
	// Campsite's bubble menu is, kept on screen. Not over a code block, where marks don't show.
	let bubbleAt = $state<{ top: number; left: number } | null>(null);
	let bubbleWidth = $state(0);
	const bubbleLeft = $derived.by(() => {
		if (!bubbleAt) return 0;
		// 8px clear of the screen's edges, as Campsite's menus keep.
		const half = bubbleWidth / 2 + 8;
		return Math.min(Math.max(bubbleAt.left, half), (innerWidth.current ?? Infinity) - half);
	});

	function placeBubble(editor: Editor) {
		const { selection } = editor.state;
		const show =
			bubble &&
			selection instanceof TextSelection &&
			!selection.empty &&
			(editor.isFocused || linkOpen) &&
			!editor.isActive('codeBlock');
		if (!show) {
			bubbleAt = null;
			return;
		}
		const start = editor.view.coordsAtPos(selection.from);
		const end = editor.view.coordsAtPos(selection.to);
		bubbleAt = { top: Math.min(start.top, end.top), left: (start.left + end.right) / 2 };
	}

	// A note's date and time: picked in the reader's own zone, stored as its instant.
	let timeOpen = $state(false);
	let timeValue = $state('');

	function insertTime(event: SubmitEvent) {
		event.preventDefault();
		const timestamp = new Date(timeValue).getTime();
		tiptap
			?.chain()
			.focus()
			.insertContent([
				{ type: 'relativeTime', attrs: { timestamp } },
				{ type: 'text', text: ' ' }
			])
			.run();
		timeOpen = false;
	}

	// The toolbar draws Campsite's icons where it has one for a tool; the rest keep their glyph.
	const toolIcons: Record<string, IconName> = {
		[text.boldGlyph]: 'bold',
		[text.italicGlyph]: 'italic',
		[text.strikeGlyph]: 'strike',
		[text.codeGlyph]: 'code',
		[text.bulletListGlyph]: 'unordered-list',
		[text.orderedListGlyph]: 'ordered-list',
		[text.taskListGlyph]: 'checklist',
		[text.quoteGlyph]: 'quote',
		[text.codeBlockGlyph]: 'code-block',
		[text.linkGlyph]: 'link',
		[text.relativeTime.insertGlyph]: 'clock',
		[text.attachGlyph]: 'picture-plus'
	};
</script>

{#snippet toolButton(
	props: Record<string, unknown>,
	label: string,
	glyph: string,
	pressed?: boolean
)}
	{@const icon = glyph === text.attachGlyph && attachIcon ? attachIcon : toolIcons[glyph]}
	<button type="button" {...props} class="tool" aria-label={label} aria-pressed={pressed}>
		{#if icon}<Icon name={icon} />{:else}{glyph}{/if}
	</button>
{/snippet}

{#snippet attachTool()}
	<Toolbar.Button {disabled} onclick={() => fileInput?.click()}>
		{#snippet child({ props })}
			{@render toolButton(props, text.attach, text.attachGlyph)}
		{/snippet}
	</Toolbar.Button>
	<input
		type="file"
		multiple
		hidden
		bind:this={fileInput}
		onchange={() => {
			uploadFrom(fileInput?.files);
			fileInput!.value = '';
		}}
	/>
{/snippet}

{#snippet formatTools()}
	{#each tools as tool (tool.label)}
		<Toolbar.Button {disabled} onclick={() => run(tool)}>
			{#snippet child({ props })}
				{@render toolButton(props, tool.label, tool.glyph, active.has(tool))}
			{/snippet}
		</Toolbar.Button>
	{/each}
	<Tooltip label={text.link} shortcut={text.linkKeys} {disabled}>
		{#snippet trigger({ props: tip })}
			<Toolbar.Button {...tip} onclick={openLinkField}>
				{#snippet child({ props })}
					{@render toolButton(props, text.link, text.linkGlyph, linkActive)}
				{/snippet}
			</Toolbar.Button>
		{/snippet}
	</Tooltip>
{/snippet}

{#snippet toolbar()}
	{@const inline = formatting && !bubble}
	{#if inline || uploadUrl || (formatting && note)}
		<Toolbar.Root aria-label={text.toolbar}>
			{#snippet child({ props })}
				<div {...props} class="toolbar">
					<!-- Along the bottom, files come first, as in Campsite's composer footer. -->
					{#if uploadUrl && toolbarLast}
						{@render attachTool()}
						{#if inline}<span class="divider" aria-hidden="true"></span>{/if}
					{/if}
					{#if inline}{@render formatTools()}{/if}
					{#if formatting && note}
						<UiPopover bind:open={timeOpen} label={text.relativeTime.insert}>
							{#snippet trigger({ props: trigger })}
								<Toolbar.Button {...trigger} {disabled}>
									{#snippet child({ props })}
										{@render toolButton(
											props,
											text.relativeTime.insert,
											text.relativeTime.insertGlyph
										)}
									{/snippet}
								</Toolbar.Button>
							{/snippet}
							<form class="time-form" onsubmit={insertTime}>
								<input
									type="datetime-local"
									required
									aria-label={text.relativeTime.field}
									bind:value={timeValue}
								/>
								<Button type="submit" size="sm">{text.relativeTime.apply}</Button>
							</form>
						</UiPopover>
					{/if}
					{#if uploadUrl && !toolbarLast}
						{@render attachTool()}
					{/if}
				</div>
			{/snippet}
		</Toolbar.Root>
	{/if}
{/snippet}

<div class="editor" data-compact={compact || undefined} aria-busy={uploading > 0}>
	{#if !toolbarLast}{@render toolbar()}{/if}
	<div class="content" bind:this={element}></div>
	{#if note}<NoteLinkCard root={element} />{/if}
	{#if toolbarLast}{@render toolbar()}{/if}
	{#if bubbleAt}
		{@const at = bubbleAt}
		<!-- Pressing a tool mustn't take focus from the text, or the selection menu would close. -->
		<Toolbar.Root aria-label={text.toolbar}>
			{#snippet child({ props })}
				<div
					{...props}
					class="toolbar bubble"
					style:inset-block-start="{at.top}px"
					style:inset-inline-start="{bubbleLeft}px"
					bind:clientWidth={bubbleWidth}
					onmousedown={(event) => event.preventDefault()}
				>
					{@render formatTools()}
				</div>
			{/snippet}
		</Toolbar.Root>
	{/if}
	<Popover.Root bind:open={linkOpen}>
		<Popover.Portal>
			<Popover.Content
				customAnchor={linkAnchor}
				sideOffset={4}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					tiptap?.commands.focus();
				}}
			>
				{#snippet child({ wrapperProps, props })}
					<div {...wrapperProps}>
						<div {...props} class="link-layer">
							<form class="link-form" onsubmit={applyLink}>
								<input
									type="text"
									aria-label={text.linkUrl}
									placeholder={text.linkUrlPlaceholder}
									bind:value={linkUrl}
								/>
								{#if linkAsksText}
									<input
										type="text"
										aria-label={text.linkText}
										placeholder={text.linkTextPlaceholder}
										bind:value={linkText}
									/>
								{/if}
								<button type="submit">{text.linkApply}</button>
								{#if linkActive}
									<button type="button" onclick={removeLink}>{text.linkRemove}</button>
								{/if}
								{#if linkError}<p role="alert">{linkError}</p>{/if}
							</form>
						</div>
					</div>
				{/snippet}
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
	<input type="hidden" {name} value={JSON.stringify(doc)} />
	{#if uploading > 0}<p class="note" role="status">{text.uploading}</p>{/if}
	{#if uploadErrors.length}
		<div class="note" role="alert">
			{#each uploadErrors as error, i (i)}<p>{error}</p>{/each}
		</div>
	{/if}
</div>

{#if gallery}
	<Lightbox images={lightboxImages} index={shown} onchange={(i) => (shown = i)} {image} />
{/if}

<style>
	.editor {
		border: var(--border-w-hairline) solid var(--hue-z0-border);
		border-radius: var(--radius-control);
		background-color: var(--hue-z0-bg);
	}

	/* Styled to match the shell's ToolbarButton, which can't be a popover trigger. */
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
		padding: var(--gap-xs);
		border-block-end: var(--border-w-hairline) solid var(--hue-z0-border);
	}

	.tool {
		min-inline-size: var(--control-h-sm);
		block-size: var(--control-h-sm);
		padding-inline: var(--gap-xs);
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--hue-z0-muted);
		font-size: var(--type-body);
		line-height: var(--leading-ui);
		cursor: pointer;
	}

	@media (pointer: coarse) {
		.tool {
			min-inline-size: var(--tap-min);
			block-size: var(--tap-min);
		}
	}

	.tool:hover:not(:disabled) {
		background-color: var(--hue-hover);
		color: var(--hue-z0-fg);
	}

	.tool[aria-pressed='true'] {
		background-color: var(--hue-selected);
		color: var(--hue-z0-fg);
	}

	.tool:disabled {
		opacity: 0.4;
	}

	/* Campsite's bubble menu: a raised row of tools just above the selection, 4px inside. */
	.bubble {
		position: fixed;
		z-index: var(--z-popover);
		max-inline-size: calc(100vw - 2 * var(--gap-sm));
		padding: var(--gap-xs);
		border: 0;
		border-radius: var(--radius-surface);
		background-color: var(--hue-z2-bg);
		box-shadow: var(--elevation-popover);
		translate: -50% calc(-100% - var(--gap-sm));
	}

	.divider {
		flex: none;
		align-self: center;
		inline-size: var(--border-w-hairline);
		block-size: 1rem;
		margin-inline: var(--gap-xs);
		background-color: var(--hue-z0-border);
	}

	.content {
		display: grid;
		min-block-size: calc(var(--gap-xl) * 6);
		padding: var(--gap-md);
	}

	[data-compact] .content {
		min-block-size: calc(var(--gap-xl) * 3);
	}

	.content :global(.ProseMirror [data-attachment]) {
		padding-inline: var(--gap-xs);
		border-radius: var(--radius-control);
		background-color: var(--hue-z1-bg);
	}

	/* A run of images (gallery.ts) as one row of square tiles, RichText's gallery in the
	   editor; the empty paragraphs between them take no room. */
	.content :global(.ProseMirror .gallery-tile) {
		display: inline-block;
		inline-size: calc(var(--gap-xl) * 6);
		aspect-ratio: 1;
		margin-block: var(--gap-sm) 0;
		margin-inline-end: var(--gap-sm);
		vertical-align: top;
		object-fit: cover;
		cursor: zoom-in;
	}

	.content :global(.ProseMirror .gallery-gap) {
		display: inline-block;
		inline-size: 0;
		margin: 0;
	}

	.content :global(.ProseMirror ul[data-type='taskList']) {
		padding-inline-start: 0;
		list-style: none;
	}

	.content :global(.ProseMirror li[data-checked]) {
		display: flex;
		gap: var(--gap-sm);
		align-items: flex-start;
	}

	/* The same box and struck-through text as a saved checklist (RichText). */
	.content :global(.ProseMirror li[data-checked] input) {
		inline-size: 1.25rem;
		block-size: 1.25rem;
		margin: 0.125rem 0 0;
		accent-color: var(--hue-blue-500);
		cursor: pointer;
	}

	.content :global(.ProseMirror li[data-checked] > div > p) {
		margin-block: 0;
	}

	.content :global(.ProseMirror li[data-checked='true'] > div) {
		color: var(--hue-text-quaternary);
		text-decoration: line-through;
		text-decoration-thickness: 0.125rem;
	}

	/* Other people's cursors and selections, drawn by the live-editing plugin. Each carries
	   data-hue, which gives it the person tokens from src/lib/styles/tokens.css. The bar is 2px,
	   heavy enough to find in a paragraph; the name over it is medium, like every name. */
	.content :global(.live-caret) {
		position: relative;
		margin-inline: calc(var(--border-w-standard) / -2);
		border-inline-start: var(--border-w-standard) solid var(--person);
		pointer-events: none;
	}

	.content :global(.live-caret-name) {
		position: absolute;
		inset-block-end: 100%;
		inset-inline-start: calc(var(--border-w-standard) * -1);
		padding-inline: var(--gap-xs);
		border-radius: var(--radius-xs);
		background-color: var(--person);
		color: var(--person-fg);
		font-family: var(--ff-ui);
		font-size: var(--type-caption);
		font-weight: var(--fw-medium);
		line-height: var(--leading-tight);
		white-space: nowrap;
		user-select: none;
	}

	.content :global(.live-selection) {
		background-color: var(--person-subtle);
	}

	.note {
		padding: 0 var(--gap-md) var(--gap-sm);
		color: var(--hue-z0-muted);
		font-size: var(--type-caption);
	}

	/* bits-ui copies this onto its floating wrapper: over the dialog the editor may sit in. */
	.link-layer {
		z-index: var(--z-popover);
	}

	.link-form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
		padding: var(--gap-sm);
		border-radius: var(--radius-surface);
		background-color: var(--hue-z2-bg);
		color: var(--hue-z2-fg);
		box-shadow: var(--elevation-popover);
	}

	.time-form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
	}
</style>
