import { time } from './time';

export const notes = {
	nav: {
		notes: 'Docs'
	},
	list: {
		title: 'Docs',
		/** The index's filters: every note you can see, yours, and those in your projects. */
		filters: { all: 'All', created: 'Yours', forMe: 'For me' },
		/** Names the filters for screen readers. */
		filtersLabel: 'Which docs',
		/** The index's orders: latest edit or comment first, or newest note first. */
		sorts: { activity: 'Recent activity', created: 'Date created' },
		/** Names the order menu's button for screen readers, with the order chosen. */
		sortedBy: (sort: string) => `Sorted by ${sort}`,
		/** The search box over the index. */
		search: 'Search docs',
		/** The index's layouts: one row per note, or a card per note. */
		layouts: { list: 'List', grid: 'Grid' },
		/** Names the layout control for screen readers. */
		layoutLabel: 'Layout',
		/** The index under each filter, with nothing in it. */
		empty: {
			all: 'No docs yet.',
			created: 'You haven’t written a doc yet.',
			forMe: 'No docs are shared with the channels you’re in yet.'
		},
		/** A search in the index found nothing. */
		noMatches: (q: string) => `No docs match “${q}”.`,
		/** Shown while the next page of notes loads. */
		loadingMore: 'Loading more docs…',
		/** The next page of notes failed to load. */
		loadFailed: 'More docs didn’t load.',
		/** Asks for the page of notes that failed again. */
		retry: 'Try again',
		create: 'New doc',
		by: (name: string) => `by ${name}`,
		updated: (at: number, timeZone: string) =>
			`updated ${new Date(at).toLocaleDateString(undefined, { timeZone })}`
	},
	docs: {
		/** The project menu's entry for its notes, and the Docs tab's name. */
		nav: 'Docs',
		/** The Docs tab's title. */
		title: (project: string) => `Docs in ${project}`,
		/** The link from the Docs tab back to its project. */
		back: (project: string) => `Back to ${project}`,
		/** A project with no notes shared with it. */
		empty: 'No docs are shared with this channel yet.'
	},
	editor: {
		newTitle: 'New doc',
		title: 'Title',
		titlePlaceholder: 'Untitled',
		bodyPlaceholder: 'Write something… Type @ to mention someone.',
		create: 'Create doc',
		cancel: 'Cancel'
	},
	note: {
		delete: 'Delete',
		/** The note's menu and the notes list: pins it to the sidebar's Favorites (Campsite's). */
		favorite: 'Favorite',
		unfavorite: 'Favorited',
		confirmDelete: 'Delete this doc and its comments?',
		privateNotice: 'Only you can see this doc until you share it.',
		readOnly: 'You can view this doc but not edit it.',
		/** The overflow menu's command that copies the note's address. */
		copyLink: 'Copy link',
		/** Its key, shown in the menu: Cmd+Shift+C on Apple devices, Ctrl+Shift+C elsewhere. */
		copyLinkKeys: { apple: '⌘⇧C', other: 'Ctrl+Shift+C' },
		/** The overflow menu's command that copies the note's id. */
		copyId: 'Copy ID',
		/** A toast once the note's address is on the clipboard. */
		linkCopied: 'Link copied',
		/** A toast once the note's id is on the clipboard. */
		idCopied: 'ID copied',
		/** The overflow menu's command that copies a published note's public address. */
		copyPublicLink: 'Copy public link',
		/** A toast once the public address is on the clipboard. */
		publicLinkCopied: 'Public link copied'
	},
	/** Comments made on a passage of a note, from the words selected in it. */
	passage: {
		/** The button by selected words that opens a comment on them. */
		comment: 'Comment',
		/** Names the popover with the comment form for the selected words. */
		formLabel: 'Comment on the selected words',
		/** The comment box's placeholder there. */
		placeholder: 'Comment on this…',
		/** Names the popover opened from words a comment was made on. */
		threadLabel: 'Comment on these words',
		/** The link from that popover to the thread in the comments below. */
		jump: 'Show in comments',
		/** The popover's text when the highlighted words' comment isn't in the list (yet). */
		missing: 'This comment isn’t here any more.'
	},
	/**
	 * A line among a note's comments for what happened to it, between the name of who did it
	 * and what it names.
	 */
	timeline: {
		/** Before the project the note was shared with or moved to. */
		project: 'moved this doc to',
		/** Before its new title. */
		title: 'renamed this doc to',
		/** Before the project it was pinned in. */
		pinned: 'pinned this doc in',
		/** Before the project it was unpinned from. */
		unpinned: 'unpinned this doc from',
		/** Before the link to the thread or note that links to it. */
		referenced: 'mentioned this doc in',
		/** Before the channel it was posted in, when someone shared it as a thread. */
		posted: 'shared this doc in',
		/** Opens a doc made from a thread, before that thread's title. */
		madeFrom: 'made this doc from',
		/** In place of the thread's title when the thread has been deleted. */
		madeFromDeleted: 'a thread'
	},
	/** The doc bar's resting word, and the list of people who edited. */
	edited: {
		/**
		 * The bar's word and, on a phone, the caption under the title: "Edited 17h ago". Under
		 * a minute it says "just now"; a week or more back it says the date, "Edited Nov 3".
		 * Limit: 24 characters.
		 */
		ago: (at: number, timeZone: string, now = Date.now()) => {
			const short = time.short(at, timeZone, now);
			if (short === 'now') return 'Edited just now';
			return /^\d+[mhd]$/.test(short) ? `Edited ${short} ago` : `Edited ${short}`;
		},
		/** Heads the list the bar opens, and is the phone's … menu item that opens it. */
		heading: 'People who edited',
		/** Names the bar button for screen readers. */
		buttonLabel: 'See who edited this doc',
		/** Read out beside a person who has the doc open right now (visually a dot). */
		now: 'Editing now',
		/** A row in the list: when that person last edited, "17h ago", "just now", "Nov 3". */
		rowTime: (at: number, timeZone: string, now = Date.now()) => {
			const short = time.short(at, timeZone, now);
			if (short === 'now') return 'just now';
			return /^\d+[mhd]$/.test(short) ? `${short} ago` : short;
		},
		/** A Docs index row's hover title. */
		rowTitle: (at: number, timeZone: string, name: string) =>
			`Edited ${time.long(at, timeZone)} by ${name}`
	},
	/** The top row of a doc's Share popover, above the quiet sharing. */
	sharePost: {
		title: 'Tell people about this doc',
		/** Under the title. True: a thread notifies followers; adding to a channel sends nothing. Limit: 64. */
		line: 'Notifies the channel’s followers. Adding it to one doesn’t.',
		button: 'Share in a thread…'
	},
	publish: {
		/** Heads the Share popover's section that publishes the note to the web. */
		title: 'Publish to the web',
		/** Under the heading while the note isn't published. */
		private: 'Publish to get a link anyone can read, without signing in. Comments stay private.',
		/** Under the heading while it is. */
		public: 'Anyone with this link can read this doc, without signing in.',
		/** Publishes it. */
		publish: 'Publish',
		/** Takes it down, so the link stops working. */
		disable: 'Disable',
		/** Copies the public address. */
		copy: 'Copy',
		/** Names the field holding the public address. */
		urlLabel: 'Public link to this doc',
		/** In place of Publish while the org has public links turned off. */
		off: 'Public links are turned off for this organization. An admin can turn them on.'
	},
	publicNote: {
		/** The byline's date on a note published to the web: its last edit. */
		updated: (at: number, timeZone: string) =>
			`Updated ${new Date(at).toLocaleDateString('en', { dateStyle: 'long', timeZone })}`
	},
	views: {
		/** Names the header button that lists who has opened the note, and heads that list. */
		title: 'Seen by',
		/** How many times the note was opened signed out, through a public link. */
		anonymous: (count: number) => (count === 1 ? '1 anonymous view' : `${count} anonymous views`)
	},
	live: {
		/**
		 * The visually hidden status (polite live region) and, for `offline` and `closed`, the line a
		 * sighted reader sees. Screen readers hear `offline` when the connection drops and `live` once
		 * every change has reached the server again, not on each save. The bar's word is
		 * `core.saveState`. Changes are held only by the open page, so `offline` asks to keep it open.
		 */
		status: {
			connecting: 'Connecting…',
			live: 'All changes saved.',
			offline: 'Offline. Keep this page open, and your changes are saved when you reconnect.',
			closed:
				'You can’t edit this doc any more. It may have been deleted, or your access changed. Reload the page.'
		},
		here: 'Here now',
		you: (name: string) => `${name} (you)`
	},
	sharing: {
		title: 'Sharing',
		people: 'People',
		project: 'Channel',
		permission: { view: 'Can view', edit: 'Can edit' },
		permissionLabel: 'Permission',
		/** Names the control that changes what one person may do with the note. */
		permissionFor: (name: string) => `What ${name} can do`,
		noProject: 'Not shared with a channel',
		addPerson: 'Share with',
		addPersonSubmit: 'Share',
		saveProject: 'Save',
		remove: (name: string) => `Stop sharing with ${name}`,
		nobody: 'Not shared with anyone.',
		guestsShareByProject: 'Guests can share docs only with their channels.'
	},
	errors: {
		noteNotFound: 'That doc doesn’t exist, or it hasn’t been shared with you.',
		cannotEdit: 'You can view this doc but not edit it.',
		cannotCreate: 'Viewers can’t create docs.',
		cannotComment: 'Viewers can’t comment or react.',
		/** Resolve was asked of a reply; only a thread's first comment resolves. */
		cannotResolveReply: 'Only a thread can be resolved, not a reply in it.',
		/** A comment came with only one end of its passage, or ends that aren't positions. */
		anchorInvalid: 'Select the words to comment on again.',
		/** A reply came with a passage; only a thread's first comment is made on one. */
		anchorOnReply: 'A reply can’t be made on a passage, only a new comment.',
		/** Someone other than the note's author or an admin tried to delete it. */
		cannotDelete: 'Only the doc’s author or an admin can delete it.',
		/** A pasted image's address couldn't be fetched: a private host, down, or not 200. */
		imageNotFetched: (url: string) => `Couldn’t get the image at ${url}.`,
		/** A pasted image's address answered with something other than an image. */
		notAnImage: (url: string) => `${url} isn’t an image.`,
		/** A pasted image's import came without its address. */
		imageUrlMissing: 'Give the address of the image to add.',
		titleTooLong: 'Keep the title under 200 characters.',
		personNotFound: 'That person isn’t an active member.',
		shareWithSelf: 'You wrote this doc, so you can already see it.',
		guestCannotSharePeople: 'Guests can share docs only with their channels.',
		permissionInvalid: 'Choose Can view or Can edit.',
		/** A viewer or view-only member tried to change who a note is shared with. */
		cannotManageSharing: 'Only people who can edit this doc can change who it’s shared with.',
		/** Someone who can only view a note tried to publish it or take it down. */
		cannotPublish: 'Only people who can edit this doc can publish it to the web.',
		/** The share form was sent with nobody chosen. */
		choosePeople: 'Choose at least one person to share with.',
		/** The share form named more people than one share allows. */
		tooManyPeople: (max: number) => `Share with up to ${max} people at a time.`,
		/** A page of the notes index was asked for with a cursor it didn't make. */
		cursorInvalid: (cursor: string) =>
			`Expected a docs page like “<time>.<id>”, got “${cursor}”. Reload the docs.`,
		/** The layout control sent something other than list or grid. */
		layoutInvalid: 'Choose List or Grid.',
		/** A comment was pinned to something that isn't an image uploaded into this note. */
		pinNotAnImage: 'You can only pin a comment to an image in this doc.'
	}
};
