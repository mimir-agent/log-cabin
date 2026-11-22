const units = ['KB', 'MB', 'GB'];

const shortDate: Intl.DateTimeFormatOptions = {
	weekday: 'short',
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit'
};
const fullDate: Intl.DateTimeFormatOptions = {
	weekday: 'long',
	year: 'numeric',
	month: 'long',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
	timeZoneName: 'short'
};

export const editor = {
	toolbar: 'Formatting',
	heading: (level: number) => `Heading ${level}`,
	headingGlyph: (level: number) => `H${level}`,
	bold: 'Bold',
	boldGlyph: 'B',
	italic: 'Italic',
	italicGlyph: 'I',
	strike: 'Strikethrough',
	strikeGlyph: 'S',
	code: 'Inline code',
	codeGlyph: '</>',
	bulletList: 'Bulleted list',
	bulletListGlyph: '•',
	orderedList: 'Numbered list',
	orderedListGlyph: '1.',
	taskList: 'Checklist',
	taskListGlyph: '☑',
	taskToggle: (done: boolean) => (done ? 'Mark not done' : 'Mark done'),
	quote: 'Quote',
	quoteGlyph: '“',
	codeBlock: 'Code block',
	codeBlockGlyph: '{ }',
	/** The note toolbar's button that marks text as a keyboard key, e.g. ⌘ K. */
	kbd: 'Keyboard key',
	/** That button's face. */
	kbdGlyph: '⌘',
	details: {
		/** The note toolbar's button that adds a section readers open and close. */
		insert: 'Collapsible section',
		/** That button's face. */
		insertGlyph: '▸',
		/** The open/close button beside a section in the editor; turned by CSS. */
		glyph: '▾',
		/** What that button does next. */
		toggle: (open: boolean) => (open ? 'Close section' : 'Open section')
	},
	relativeTime: {
		/** The note toolbar's button that adds a date and time shown on each reader's own clock. */
		insert: 'Date and time',
		/** That button's face, drawn as a clock. */
		insertGlyph: 'Time',
		/** The date and time field inside its popover. */
		field: 'When',
		/** The popover's button that adds it. */
		apply: 'Insert',
		/** What a reader sees: the time on their own clock, e.g. "Wed, Jan 2, 6:30 PM". */
		chip: (at: number, timeZone: string) =>
			new Date(at).toLocaleString('en', { ...shortDate, timeZone }),
		/** Its title on hover: the full date and time in the zone it was written in. */
		title: (at: number, timeZone: string) =>
			new Date(at).toLocaleString('en', { ...fullDate, timeZone }),
		/** How it reads in search and previews, which have no reader: the date in UTC. */
		text: (at: number) => new Date(at).toLocaleString('en', { ...fullDate, timeZone: 'UTC' })
	},
	resourceMention: {
		/**
		 * The chip for a note, thread or call the reader can't open, or that is gone: no title, no
		 * link, and the same words for every cause.
		 */
		unavailable: { post: 'Thread unavailable', note: 'Doc unavailable', call: 'Call unavailable' },
		/** What a chip reads as in search and previews, which never show its title. */
		plain: { post: 'a linked thread', note: 'a linked doc', call: 'a linked call' },
		/** The label of a chip the reader can open: its kind word, then its title. */
		aria: (kind: string, title: string) => `${kind}: ${title}`,
		/** Beside each note, thread and call the @ list offers, after people. */
		kind: { note: 'Doc', post: 'Thread', call: 'Call' },
		/** Why a mention's title can't be shown to this person. */
		notFound: 'That doc, thread or call doesn’t exist, or you can’t see it.'
	},
	link: 'Link',
	linkGlyph: 'Link',
	linkUrl: 'Link address',
	linkApply: 'Apply',
	linkRemove: 'Remove link',
	linkInvalid: 'Use a web address starting with http:// or https://, or a mailto: address.',
	/**
	 * Link's shortcut, shown after "Link" in its tooltip as a key, the way the menus show theirs
	 * (Campsite's tooltip shows the label, then the keys).
	 */
	linkKeys: { apple: '⌘K', other: 'Ctrl+K' },
	/** The link field that Ctrl/⌘+K opens with nothing selected: the address, as Campsite words it. */
	linkUrlPlaceholder: 'Enter a URL…',
	/** Its second field, the words that show in place of the address. */
	linkText: 'Link text',
	linkTextPlaceholder: 'Text to show (optional)',
	/**
	 * The menu that `/` opens. Campsite shows one ungrouped list, so there are no group headings.
	 * Each item has a label, a one-line hint under it, and search aliases that are never shown.
	 */
	slash: {
		/** The list's accessible name. */
		list: 'Formatting and inserts',
		/**
		 * Shown, muted, on the empty paragraph that holds the caret, in a note or the full-screen
		 * composer that already has text. Never in comments or chat. One line on a 358 px phone at
		 * 16 px: 40 characters at most.
		 */
		emptyLineHint: 'Type / for headings, lists and more',
		/** Shown when nothing matches what was typed after `/`, with Campsite's dismiss action. */
		empty: 'No results',
		dismiss: 'Dismiss',
		text: {
			label: 'Text',
			hint: 'Plain paragraph',
			aliases: ['paragraph', 'plain', 'body', 'normal']
		},
		heading1: {
			label: 'Heading 1',
			hint: 'Big section heading',
			aliases: ['h1', 'title', 'heading', 'header', 'large']
		},
		heading2: {
			label: 'Heading 2',
			hint: 'Medium section heading',
			aliases: ['h2', 'subtitle', 'heading', 'header', 'medium']
		},
		heading3: {
			label: 'Heading 3',
			hint: 'Small section heading',
			aliases: ['h3', 'subtitle', 'heading', 'header', 'small']
		},
		bulletList: {
			label: 'Bulleted list',
			hint: 'List with bullets',
			aliases: ['bullet', 'unordered', 'ul', 'list', 'points']
		},
		orderedList: {
			label: 'Numbered list',
			hint: 'List with numbers',
			aliases: ['ordered', 'ol', 'number', 'list', 'steps']
		},
		taskList: {
			label: 'Checklist',
			hint: 'List with checkboxes',
			aliases: ['todo', 'to-do', 'task', 'check', 'checkbox', 'list']
		},
		quote: {
			label: 'Quote',
			hint: 'Quoted text',
			aliases: ['blockquote', 'citation', 'quotation']
		},
		codeBlock: {
			label: 'Code block',
			hint: 'Block of code',
			aliases: ['code', 'codeblock', 'snippet', 'pre', 'monospace']
		},
		divider: {
			label: 'Divider',
			hint: 'Line between sections',
			aliases: ['divider', 'separator', 'horizontal', 'rule', 'hr', 'line']
		},
		details: {
			label: 'Collapsible section',
			hint: 'Section readers open and close',
			aliases: ['toggle', 'section', 'collapse', 'expand', 'details', 'accordion']
		},
		file: {
			label: 'Image or file',
			hint: 'Upload from your device',
			aliases: ['photo', 'picture', 'image', 'media', 'video', 'gif', 'file', 'upload', 'attach']
		},
		mention: {
			label: 'Mention someone',
			hint: 'Notify a person by name',
			aliases: ['mention', 'person', 'people', 'user', 'member', 'tag', '@']
		},
		callLink: {
			label: 'Call link',
			hint: 'Link to your room',
			aliases: ['call', 'room', 'meeting', 'video', 'huddle', 'join']
		},
		emoji: {
			label: 'Emoji',
			hint: 'Search emoji by name',
			aliases: ['emoji', 'emoticon', 'reaction', 'smiley', 'icon']
		},
		/** Placeholder copy. Adds a time for the next full hour. */
		time: {
			label: 'Time',
			hint: 'Time shown in each reader’s zone',
			aliases: ['date', 'clock', 'when', 'schedule']
		},
		reference: {
			label: 'Link to a thread or doc',
			hint: 'Search threads and docs by title',
			aliases: ['link', 'reference', 'thread', 'post', 'note', 'doc', 'page']
		}
	},
	/** The Emoji button in the toolbar and the list that `:` and two letters open. */
	emojiTool: {
		/** The button's accessible name and tooltip, as Campsite's composer words it. */
		button: 'Add emoji',
		tooltip: 'Add emoji',
		/** The `:` list's accessible name. */
		list: 'Emoji to insert',
		/** Shown when no emoji matches, with Campsite's dismiss action. */
		empty: 'No results',
		dismiss: 'Dismiss'
	},
	attach: 'Attach files',
	attachGlyph: 'Attach',
	uploading: 'Uploading…',
	uploadFailed: (name: string, message: string) => `Couldn’t upload ${name}: ${message}`,
	mentionList: 'People to mention',
	mentionEmpty: 'No one matches.',
	linkPreview: {
		video: 'YouTube video',
		play: (title: string) => `Play ${title}`,
		/** A thread linked in a message (Campsite's thread card). */
		post: (author: string, project: string) => `${author} in ${project}`,
		unavailable: 'This thread isn’t available to you.'
	},
	gallery: {
		label: (n: number) => `${n} images`,
		open: (alt: string) => `Open ${alt || 'image'}`,
		lightbox: 'Image viewer',
		position: (i: number, n: number) => `${i} of ${n}`,
		previous: 'Previous image',
		next: 'Next image',
		close: 'Close'
	},
	/** A byte count as a short human size, e.g. "2.4 MB". */
	fileSize: (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		let size = bytes / 1024;
		let unit = 0;
		while (size >= 1024 && unit < units.length - 1) {
			size /= 1024;
			unit++;
		}
		return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
	}
};
