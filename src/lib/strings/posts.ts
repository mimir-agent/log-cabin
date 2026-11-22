import { calendarDay } from '../time-zone';

export const posts = {
	nav: {
		projects: 'Channels'
	},
	projects: {
		title: 'Channels',
		archivedTitle: 'Archived channels',
		showArchived: 'Archived channels',
		showOpen: 'Open channels',
		empty: 'No channels yet.',
		create: 'New channel',
		name: 'Name',
		description: 'Description',
		private: 'Private: only people added to the channel can see it',
		submitCreate: 'Create channel',
		privateBadge: 'Private',
		archivedBadge: 'Archived',
		joinedBadge: 'Joined',
		join: 'Join',
		leave: 'Leave',
		favorite: 'Add to favorites',
		unfavorite: 'Remove from favorites',
		archive: 'Archive',
		unarchive: 'Unarchive',
		people: 'Members',
		addPerson: 'Add person',
		addPersonSubmit: 'Add',
		removePerson: (name: string) => `Remove ${name}`,
		noPeople: 'Nobody has joined yet.',
		archivedNotice: 'This channel is archived. Its threads can be read but not changed.'
	},
	/** PA-C1: a channel's settings after it is made, the same words as Campsite's edit dialog. */
	channelSettings: {
		menuEdit: 'Edit',
		title: 'Edit channel',
		nameLabel: 'Channel name',
		descriptionLabel: 'Description',
		descriptionPlaceholder: 'Description (optional)',
		emojiLabel: 'Emoji',
		emojiPick: 'Choose an emoji',
		emojiRemove: 'Remove emoji',
		visibilityLabel: 'Visibility',
		public: 'Public: anyone in the organization can see and join it',
		private: 'Private: only people added to the channel can see it',
		/** Shown when someone makes a public channel private. */
		makePrivateWarning:
			'People who aren’t members will lose access to this channel and its threads.',
		/** Shown when someone makes a private channel public. */
		makePublicWarning: 'Everyone in the organization will be able to see this channel and join it.',
		privateNeedsMember: 'A private channel needs at least one member.',
		/** Shown when the person making a channel private isn't in it. */
		makePrivateLosesYourAccess:
			'You’re not in this channel. If you make it private, you’ll lose access to it.',
		/** Shown when the emoji field holds more than one emoji. */
		accessoryTooLong: 'That’s too long for an icon. Use a single emoji.',
		defaultCannotBePrivate: 'A default channel can’t be private.',
		save: 'Save',
		saving: 'Saving',
		saved: 'Channel updated',
		membersOnly: 'Guests can’t edit channels.',
		/** A bookmark edited in place. */
		bookmarkEditTitle: 'Edit link',
		bookmarkEdit: 'Edit',
		bookmarkTitleLabel: 'Title',
		bookmarkUrlLabel: 'Link',
		bookmarkSave: 'Save link',
		bookmarkSaved: 'Link updated'
	},
	/** PA-C2: deleting a channel. Notes and calls stay; what goes is what Campsite discards. */
	channelDelete: {
		menu: 'Delete',
		title: 'Delete channel',
		confirmEmpty: 'Delete this channel? This can’t be undone.',
		confirmWithPosts:
			'This channel has threads. Deleting it also deletes its threads, comments, pins, links and guest invite link, and removes everyone from it. Notes and calls that were shared with it stay, without a channel. This can’t be undone.',
		typeName: 'Type the name of the channel to confirm.',
		submit: 'Delete',
		submitting: 'Deleting',
		/** The last member of a private channel can’t just leave: nobody would be able to see it. */
		leaveAndDelete: 'Leave & delete',
		lastMemberNotice:
			'You’re the last member of this private channel. Leaving it deletes it, and its threads with it.',
		cancel: 'Cancel',
		deleted: 'Channel deleted',
		/** Where an old link to the channel lands. */
		goneTitle: 'This channel was deleted',
		goneBody: 'Its threads and comments are gone. Choose another channel from the sidebar.',
		archivedBy: (name: string) => `Archived by ${name}`,
		cannotDelete: 'Only the channel’s creator or an admin can delete it.'
	},
	/** PA-C3: unread dots and Mark unread. */
	channelRead: {
		markUnread: 'Mark unread',
		markRead: 'Mark read',
		unreadDot: 'Unread',
		unreadLabel: (name: string) => `${name}, unread`,
		markedUnread: 'Marked unread',
		markedRead: 'Marked read'
	},
	/** PA-C4: a channel's notification level. */
	channelNotify: {
		menu: 'Notifications',
		title: 'Channel notifications',
		all: 'Threads and comments',
		allHint: 'Every new thread, and the comments on threads in this channel',
		posts: 'New threads',
		postsHint: 'Only new threads',
		none: 'None',
		noneHint: 'Nothing from this channel',
		subscribedAll: 'You’ll hear about threads and comments in this channel',
		subscribedPosts: 'You’ll hear about new threads in this channel',
		unsubscribed: 'You won’t be notified about this channel',
		subscribe: 'Subscribe',
		subscribed: 'Subscribed'
	},
	/** PA-C5: default channels and #general. */
	channelDefaults: {
		label: 'Default channel',
		hint: 'New members join this channel automatically.',
		toggleName: 'Default channel membership',
		generalBadge: 'General',
		generalHint: 'Everyone in the organization is in this channel.',
		generalCannotLeave: 'You can’t leave #general.',
		generalCannotDelete: 'You can’t delete #general.',
		generalCannotBePrivate: 'General can’t be private.',
		adminsOnly: 'Only admins can make a channel default.',
		onboardTitle: 'What are you working on?',
		onboardSubtitle:
			'This makes your first channel. Everyone who joins is added to it, and you can make more later.',
		onboardNameLabel: 'Channel name',
		onboardNameMissing: 'Channel name is required',
		onboardNameTooLong: 'Channel name is too long'
	},
	/** PA-C6: a guest invite link for one channel. */
	channelGuest: {
		title: 'Invite guests',
		description: 'Guests can only see this channel. They don’t count toward your plan.',
		emailPlaceholder: 'Email address',
		addAnother: 'Add another',
		remove: 'Remove',
		send: 'Send invitations',
		linkHeading: 'Invite with a link',
		linkHint: 'Anyone with this link can join this channel as a guest.',
		linkLabel: 'Invitation link',
		copy: 'Copy link',
		copied: 'Link copied',
		reset: 'Reset',
		resetTitle: 'Reset the invitation link?',
		resetBody: 'The old link will stop working. Guests who already joined keep their access.',
		resetConfirm: 'Reset link',
		resetDone: 'Invitation link reset',
		manageMembers: 'Manage members',
		done: 'Done',
		landingTitle: (channel: string) => `Join ${channel}`,
		landingBody: (channel: string, org: string) =>
			`You’ve been invited to ${channel} in ${org} as a guest. You’ll only see this channel.`,
		landingJoin: 'Join as a guest',
		landingSignedInAs: (email: string) => `You’re signed in as ${email}.`,
		landingAlreadyIn: 'You’re already in this channel.',
		invalid: 'This invitation link doesn’t work. Ask for a new one.',
		invalidReset: 'This invitation link was reset. Ask for the new one.',
		wrongChannel: 'This link is for a different channel.',
		cannotManage: 'Only admins can see or reset a guest link.'
	},
	/** PA-C7: drag to reorder, with the keyboard as the other way. */
	channelOrder: {
		favoritesHeading: 'Favorites',
		dragHandle: (name: string) => `Reorder ${name}`,
		moveUp: (name: string) => `Move ${name} up`,
		moveDown: (name: string) => `Move ${name} down`,
		/** Read out as the item moves. */
		moved: (name: string, position: number, total: number) =>
			`${name} moved to position ${position} of ${total}`,
		instructions:
			'Press space to pick it up, the arrow keys to move it, and space again to drop it.',
		pickedUp: (name: string) => `Picked up ${name}`,
		dropped: (name: string, position: number, total: number) =>
			`Dropped ${name} at position ${position} of ${total}`,
		saveFailed: 'Couldn’t save the new order. Try again.',
		favoriteCall: 'Add call to favorites',
		unfavoriteCall: 'Remove call from favorites'
	},
	/** PA-C8: a member's channels and posts, and adding one member to several channels. */
	memberChannels: {
		tabChannels: 'Channels',
		tabPosts: 'Threads',
		noChannels: (name: string) => `${name} isn’t in any channels you can see.`,
		noPosts: (name: string) => `${name} hasn’t started any threads you can see.`,
		addToChannels: 'Add to channels',
		addTitle: (name: string) => `Add ${name} to channels`,
		addHint: 'Check the channels they should be in. Uncheck the ones they should leave.',
		search: 'Search channels',
		save: 'Save',
		saved: (name: string) => `Updated the channels ${name} is in`,
		unchanged: 'Nothing to change.',
		adminsOnly: 'Only admins can change which channels a member is in.'
	},
	feed: {
		homeTitle: 'Home',
		empty: 'No threads yet.',
		more: 'Older threads',
		comments: (n: number) => (n === 1 ? '1 comment' : `${n} comments`),
		inProject: (name: string) => `in ${name}`,
		by: (name: string) => `by ${name}`,
		edited: 'edited',
		resolved: 'Resolved',
		share: 'What do you want to share?',
		/** A feed's day heading in the reader's zone: Today, Yesterday, then the full date. */
		day: (at: Date, timeZone: string, now = Date.now()) => {
			const days =
				(Date.parse(calendarDay(now, timeZone)) - Date.parse(calendarDay(at, timeZone))) /
				86_400_000;
			if (days === 0) return 'Today';
			if (days === 1) return 'Yesterday';
			return at.toLocaleDateString('en-US', {
				timeZone,
				weekday: 'long',
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		}
	},
	/** The thread page's … menu item that copies the thread into a new doc. */
	makeDoc: 'Make a doc from this thread',
	/**
		What a feed shows and how it is found. Sits beside feed.display (Display and sort), which
		holds density and ordering; these are Campsite's Display toggles, for Home and each channel.
	*/
	feedDisplay: {
		show: 'Display',
		reactions: 'Reactions',
		attachments: 'Attachments',
		comments: 'Comments',
		resolved: 'Resolved posts',
		/** Channel only, admins: make the current toggles what members see until they choose their own. */
		setDefault: 'Set as channel default',
		defaultSet: 'Channel default saved.',
		/** Channel only: drop my own choices and follow the channel default. */
		reset: 'Reset to defaults',
		resetDone: 'Display reset to the channel default.',
		cannotSetDefault: 'Only channel admins can set the default.',
		search: 'Search posts',
		searchClear: 'Clear search',
		author: 'Author',
		anyAuthor: 'Anyone',
		hideResolved: 'Hide resolved posts',
		noMatches: (q: string) => `No posts match “${q}”.`
	},
	composer: {
		newPost: 'New thread',
		title: 'Title',
		titlePlaceholder: 'Title',
		/** Under the composer's head while there is a body but no title, so a grey Start thread says why. */
		titleNeeded: 'Add a title to start the thread.',
		bodyPlaceholder: 'Write something… Type @ to mention someone.',
		submit: 'Start thread',
		/** Read out by the spinner in Start thread while the thread is on its way. */
		posting: 'Starting',
		save: 'Save',
		cancel: 'Cancel',
		saveDraft: 'Save draft',
		/** The project picker in the composer's head, and its shortcut. */
		changeProject: 'Change channel',
		searchProjects: 'Search channels',
		noProjects: 'No channels found.',
		guests: (n: number) => (n === 1 ? '1 guest' : `${n} guests`),
		expand: 'Expand',
		shrink: 'Shrink',
		created: 'Thread created',
		view: 'View',
		draftKept: 'Draft saved',
		viewDrafts: 'Drafts'
	},
	post: {
		edit: 'Edit',
		delete: 'Delete',
		confirmDelete: 'Delete this thread and its comments?',
		edited: 'edited',
		/** Beside the date of a thread started from a message (Campsite's). */
		fromMessage: (conversation: string) => `From a message in ${conversation}`,
		resolve: 'Resolve',
		unresolve: 'Reopen',
		resolvedBy: (name: string) => `Resolved by ${name}`,
		resolvedWith: 'Resolved by this comment',
		resolveWithComment: 'Resolve with this comment',
		breadcrumb: 'Breadcrumb',
		crumbSeparator: '/',
		separator: '·',
		editTitle: 'Edit thread',
		when: (at: number, timeZone: string) =>
			new Date(at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short', timeZone })
	},
	poll: {
		label: 'Poll',
		add: 'Add a poll',
		remove: 'Remove poll',
		question: 'Question (optional)',
		option: (n: number) => `Option ${n}`,
		addOption: 'Add option',
		removeOption: (n: number) => `Remove option ${n}`,
		vote: (option: string) => `Vote for ${option}`,
		votes: (n: number) => (n === 1 ? '1 vote' : `${n} votes`),
		percent: (n: number) => `${n}%`,
		yourVote: 'Your vote',
		noVoters: 'No votes yet.',
		cannotVote: 'You can see this poll but not vote in it.'
	},
	drafts: {
		title: 'Drafts',
		empty: 'No drafts. Threads you start and don’t publish are kept here.',
		untitled: 'Untitled',
		inProject: (name: string) => `in ${name}`,
		saved: (at: number, timeZone: string) =>
			`Draft saved ${new Date(at).toLocaleTimeString('en', { timeStyle: 'short', timeZone })}`,
		/** Superseded in the composer's head by `core.saveState`; kept while code still uses it. */
		saving: 'Saving draft…',
		/** Superseded too: before the first change, the head shows no save state. */
		notSaved: 'Not saved yet',
		saveFailed: (message: string) => `Couldn’t save the draft: ${message}`,
		delete: 'Delete draft',
		confirmDelete: 'Delete this draft?',
		editTitle: 'Draft'
	},
	versions: {
		newVersion: 'New version',
		title: 'Versions',
		label: (n: number) => `Version ${n}`,
		latest: 'Latest',
		current: 'This version',
		olderNotice: (n: number) => `You’re reading version ${n}. A newer version exists.`,
		goToLatest: 'Go to the latest version',
		all: (n: number) => `${n} versions`
	},
	comments: {
		title: 'Comments',
		/** The switch beside the heading: new comments reach your inbox while it's on. */
		notifications: 'Notifications',
		empty: 'No comments yet.',
		placeholder: 'Write a comment…',
		replyPlaceholder: 'Write a reply…',
		cancelReply: 'Cancel reply',
		replyingTo: (name: string) => `Replying to ${name}`,
		discardTitle: 'Discard draft',
		discardQuestion: 'Are you sure you want to discard this comment draft?',
		discard: 'Discard',
		submit: 'Comment',
		submitReply: 'Reply',
		edit: 'Edit',
		save: 'Save',
		cancel: 'Cancel',
		delete: 'Delete',
		confirmDelete: 'Delete this comment and its replies?',
		edited: 'edited',
		readOnly: 'You can read this channel but not comment in it.',
		/** The one line a resolved thread shows; no name once the resolver is gone. */
		resolvedBy: (name: string | null) => (name ? `Resolved by ${name}` : 'Resolved'),
		/** A thread comment's resolve button and menu item, as in Campsite. */
		resolveComment: 'Resolve comment',
		reopenComment: 'Reopen comment',
		/** The collapsed line a resolved thread shows; it expands the thread. No name once the resolver is gone. */
		resolvedThread: (name: string | null) =>
			name ? `${name} resolved this thread` : 'This thread was resolved',
		/** On the comment a thread was resolved with. */
		resolvesPost: 'Resolves thread',
		/** The comment menu's item that resolves the whole thread with this comment. */
		resolvePost: 'Resolve thread',
		reopenPost: 'Reopen thread'
	},
	/** Resolving a thread: the dialog, the resolution under the thread, and reopening (Campsite's ResolveDialog and Resolution). */
	resolve: {
		menuItem: 'Resolve thread',
		dialogTitle: 'Resolve thread',
		dialogIntro: 'Let your team know why this thread is resolved.',
		placeholder: 'Add a reason (optional)',
		/** Fills the editor with a draft from the thread and its comments. Nothing saves until Resolve. */
		draft: 'Draft with AI',
		drafting: 'Drafting a resolution…',
		draftNotice:
			'Drafted by AI from this thread and its comments. It can get things wrong, so check it before you resolve.',
		draftEmpty:
			'Every point the AI drafted added something that isn’t in this thread or its comments, so there’s no draft. Write the resolution yourself.',
		draftTooShort: 'There’s too little here to draft a resolution from yet.',
		draftFailed:
			'The draft couldn’t be written just now. Try again in a minute, or write the resolution yourself.',
		/** Above the comment being used, when resolving from a comment. */
		commented: (name: string) => `${name} commented`,
		cancel: 'Cancel',
		submit: 'Resolve',
		/** The banner on a resolved thread; the resolution shows under it. */
		banner: 'Thread resolved',
		resolvedBy: (name: string | null) => (name ? `Resolved by ${name}` : 'Resolved'),
		expand: 'Show resolution',
		collapse: 'Hide resolution',
		viewComment: 'View comment',
		/** The resolution's stand-in when the thread was resolved with a comment and nothing written. */
		fromComment: (name: string) => `${name}’s comment`,
		reopen: 'Reopen thread',
		reopenTitle: 'Reopen thread?',
		reopenIntro: 'This deletes the resolution and reopens the thread.',
		reopenCancel: 'Cancel',
		reopenConfirm: 'Reopen thread'
	},
	/** Sending a thread to people or into chats (Campsite's thread share; Slack is left out). */
	share: {
		/** The Share popover's section, under the public link. */
		heading: 'Send to people or DMs',
		dialogTitle: 'Share thread',
		pickerLabel: 'People and DMs',
		pickerPlaceholder: 'Search people and DMs',
		pickerHint: 'Only people who can see this thread are listed.',
		people: 'People',
		chats: 'DMs',
		noMatch: 'No one who can see this thread matches.',
		remove: (name: string) => `Remove ${name}`,
		send: 'Send',
		sending: 'Sending',
		sent: (chats: number) => (chats === 1 ? 'Sent to 1 DM' : `Sent to ${chats} DMs`),
		/** The message the thread arrives as in each chat. */
		message: (sharer: string, author: string | null, isPoll: boolean) =>
			`${sharer} shared a ${isPoll ? 'poll' : 'thread'}${author ? ` by ${author}` : ''}`,
		/** The shared-thread card inside that message. */
		card: {
			view: 'View thread',
			untitled: (author: string) => `${author}’s thread`,
			inChannel: (channel: string) => `in ${channel}`,
			cannotSee: 'You can’t see this thread.',
			deleted: 'This thread was deleted.'
		}
	},
	/** Campsite's thread-level status, shown as a badge on the thread and in the feed. */
	status: {
		badge: 'Feedback requested',
		/** A checkable item in the thread menu, ticked while the status is on. */
		menuItem: 'Feedback requested'
	},
	/** Named links beside a thread's body (Campsite's thread links). The same words as a channel's links. */
	postLinks: {
		title: 'Links',
		empty: 'No links yet.',
		add: 'Add link',
		addTitle: 'Add link',
		editTitle: 'Edit link',
		titleLabel: 'Title',
		urlLabel: 'Web address',
		urlPlaceholder: 'https://',
		submitAdd: 'Add',
		submitEdit: 'Save',
		cancel: 'Cancel',
		edit: (title: string) => `Edit ${title}`,
		remove: (title: string) => `Remove ${title}`,
		confirmRemove: (title: string) => `Remove ${title} from this thread?`
	},
	reactions: {
		label: 'Reactions',
		add: 'Add reaction',
		toggle: (emoji: string, names: string[]) => `${emoji} ${names.join(', ')}`
	},
	feedback: {
		ask: 'Ask for feedback',
		dialogTitle: 'Ask for feedback',
		dialogIntro: 'Each person gets an item in their inbox, which they can answer or dismiss.',
		noOneToAsk: 'Nobody else can see this thread yet.',
		send: 'Ask',
		cancel: 'Cancel',
		heading: 'Feedback requested from',
		status: {
			waiting: 'Waiting',
			replied: 'Responded',
			dismissed: 'Dismissed'
		},
		withdraw: (name: string) => `Stop asking ${name}`,
		askedYou: (name: string) => `${name} asked for your feedback on this thread.`,
		dismiss: 'Dismiss'
	},
	canvas: {
		start: 'Comment on this image',
		stop: 'Cancel',
		hint: 'Click or tap the spot you want to comment on.',
		placeHere: 'Pin a comment here',
		placeholder: 'Comment on this spot…',
		submit: 'Comment',
		marker: (n: number, author: string) => `Comment ${n} by ${author}`,
		onImage: 'Pinned to the image'
	},
	followUps: {
		remindMe: 'Follow up',
		change: 'Change time',
		/** The trigger once a follow up is set, e.g. "Follow up: Tue, Nov 24, 9:00 AM". */
		set: 'Follow up:',
		setTime: (at: number, timeZone: string) =>
			new Date(at).toLocaleString('en', {
				timeZone,
				weekday: 'short',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit'
			}),
		/** A follow up's exact time, shown on hover. */
		exactTime: (at: number, timeZone: string) =>
			new Date(at).toLocaleString('en', { dateStyle: 'full', timeStyle: 'long', timeZone }),
		presets: {
			hour: 'In 1 hour',
			threeHours: 'In 3 hours',
			tomorrow: 'Tomorrow at 9 AM',
			nextWeek: 'Next Monday at 9 AM'
		},
		custom: 'Pick a time…',
		pickTitle: 'Follow up at',
		pickLabel: 'Date and time',
		/** Checked by default in the time dialog. Pushes through the schedule and a pause. */
		notifyAnyway: 'Notify me even when paused or outside my schedule',
		cancel: 'Cancel',
		save: 'Set',
		remove: 'Remove follow up',
		pageTitle: 'Follow ups',
		pageIntro:
			'Follow ups you’ve set on threads, comments, docs and calls. Each shows up in your inbox when it’s due.',
		empty: 'No follow ups coming up.',
		due: 'Due',
		subjects: {
			post: 'Thread',
			comment: 'Comment',
			note: 'Doc',
			call: 'Call'
		}
	},
	picker: {
		label: 'Emoji',
		search: 'Search emoji',
		loading: 'Loading emoji',
		frequent: 'Frequently used',
		noMatch: 'No emoji match',
		addCustom: 'Add a custom emoji',
		skinTone: 'Skin tone',
		// Category tabs: a glyph each, named by the section title.
		tabs: {
			frequent: '⏱',
			custom: '★',
			smileys_emotion: '☺',
			people_body: '👋',
			animals_nature: '🐻',
			food_drink: '🍔',
			travel_places: '✈',
			activities: '⚽',
			objects: '💡',
			symbols: '#',
			flags: '⚑'
		} as Record<string, string>
	},
	tags: {
		title: (tag: string) => `#${tag}`,
		description: 'Threads with this tag in channels you can see',
		/** The page that lists every tag. */
		indexTitle: 'Tags',
		empty: 'No tags yet.',
		count: (n: number) => (n === 1 ? '1 post' : `${n} posts`),
		create: 'New tag',
		createTitle: 'New tag',
		nameLabel: 'Tag name',
		createSubmit: 'Create tag',
		rename: 'Rename tag',
		renameTitle: 'Rename tag',
		renameSave: 'Save',
		cancel: 'Cancel',
		delete: 'Delete tag',
		deleteTitle: 'Delete tag',
		deleteConfirmEmpty: 'Delete this tag?',
		/** Shown when posts use the tag; the posts themselves stay. */
		deleteConfirm: (n: number) =>
			`${n === 1 ? '1 post uses' : `${n} posts use`} this tag. Deleting it removes the tag from ${n === 1 ? 'that post' : 'those posts'}. The posts stay.`,
		created: 'Tag created.',
		renamed: 'Tag renamed.',
		deleted: 'Tag deleted.',
		errors: {
			taken: 'A tag with that name already exists.',
			notFound: 'That tag doesn’t exist.'
		}
	},
	/** Who has opened a post, and how many signed-out visitors opened a public one. */
	seenBy: {
		title: 'Seen by',
		empty: 'Nobody has seen this post yet.',
		lastViewed: (ago: string) => `Last viewed ${ago}`,
		anonymous: (count: number) => (count === 1 ? '1 anonymous view' : `${count} anonymous views`)
	},
	pins: {
		title: 'Pinned',
		pin: 'Pin to channel',
		unpin: 'Unpin',
		unpinItem: (title: string) => `Unpin ${title}`,
		kinds: { post: 'Thread', note: 'Doc', call: 'Call' },
		untitledCall: (at: number, timeZone: string) =>
			`Call on ${new Date(at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short', timeZone })}`
	},
	move: {
		menuLabel: 'Move to channel',
		noTargets: 'There’s no other channel you can start a thread in.',
		// A project the reader can't see, or one since deleted, has no name here.
		line: (by: string, from: string | null, to: string | null) =>
			`${by} moved this from ${from ?? 'another channel'} to ${to ?? 'another channel'}`
	},
	publicLink: {
		share: 'Share',
		label: 'Public link',
		description:
			'Anyone with the link can read this thread without signing in. Comments stay private.',
		copy: 'Copy link',
		copied: 'Copied',
		urlLabel: 'Public link to this thread',
		footer: (at: number, org: string, timeZone: string) =>
			`Started ${new Date(at).toLocaleDateString('en', { dateStyle: 'long', timeZone })} · Shared from ${org}`,
		deadTitle: 'Link not found',
		settings: {
			allow: 'Allow public links',
			/** The switch covers threads and published notes alike. */
			allowHint:
				'Authors and admins can share a thread, and editors can publish a doc, with a link anyone can read. Turning this off stops every public link from working.',
			index: 'Let search engines index public threads and docs'
		}
	},
	emoji: {
		nav: 'Emoji',
		title: 'Custom emoji',
		intro: (org: string) =>
			`${org}’s own emoji. Use them as reactions, or type :name: in a thread, comment or message.`,
		empty: 'No custom emoji yet.',
		add: 'Add emoji',
		nameLabel: 'Name',
		nameHint: 'Lowercase letters, numbers, - and _, 2 to 32 characters. People type it as :name:.',
		fileLabel: 'Image',
		fileHint: 'PNG, GIF or WebP, up to 256 KB. Square images look best.',
		submit: 'Add emoji',
		addedBy: (name: string) => `Added by ${name}`,
		remove: (name: string) => `Remove :${name}:`,
		readOnly: 'Only admins can add emoji here.',
		whoMayAdd: 'Who can add custom emoji',
		whoMayAddOptions: { members: 'Members and admins', admins: 'Admins only' },
		errors: {
			cannotAdd: 'You can’t add emoji in this organization. Ask an admin.',
			cannotRemove: 'Only the person who added this emoji or an admin can remove it.',
			nameInvalid:
				'Use 2 to 32 lowercase letters, numbers, hyphens and underscores for the name, like ship-it.',
			nameTaken: (name: string) => `There’s already an emoji called :${name}:. Pick another name.`,
			type: (file: string) => `${file} isn’t a PNG, GIF or WebP image.`,
			size: (file: string, maxBytes: number) =>
				`${file} is larger than ${Math.round(maxBytes / 1024)} KB. Use a smaller image.`,
			notFound: 'That emoji doesn’t exist any more.',
			whoInvalid: (value: string) => `Expected members or admins to add emoji, got “${value}”.`
		}
	},
	bookmarks: {
		title: 'Bookmarks',
		add: 'Add bookmark',
		titleLabel: 'Title',
		urlLabel: 'Web address',
		urlPlaceholder: 'https://',
		submit: 'Add',
		moveUp: (title: string) => `Move ${title} up`,
		moveDown: (title: string) => `Move ${title} down`,
		remove: (title: string) => `Remove ${title}`
	},
	errors: {
		projectNotFound: 'That channel doesn’t exist, or you don’t have access to it.',
		postNotFound: 'That thread doesn’t exist, or you don’t have access to it.',
		commentNotFound: 'That comment isn’t on this thread.',
		fileNotFound: 'That file doesn’t exist, or you don’t have access to it.',
		personNotFound: 'That person isn’t an active member of this organization.',
		cannotWrite: 'You can read this channel but not start threads, comment or react in it.',
		cannotCreateProject: 'Only members and admins can create channels.',
		cannotJoin: 'You can only join public channels. Ask someone in the channel to add you.',
		cannotManage: 'Only the channel’s creator or an admin can do that.',
		notYourPost: 'Only the thread’s author or an admin can do that.',
		notYourComment: 'Only the comment’s author or an admin can do that.',
		projectNameMissing: 'Give the channel a name.',
		projectNameTooLong: 'Keep the channel name to 80 characters or fewer.',
		titleMissing: 'Give the thread a title.',
		titleTooLong: 'Keep the title to 200 characters or fewer.',
		bodyMissing: 'Write something before you start the thread.',
		bodyInvalid: (detail: string) =>
			`Part of this text can’t be saved (${detail}). Reload the page and try again.`,
		badCursor: 'That page link is broken. Go back to the first page.',
		tickInvalid: 'That checkbox couldn’t be saved. Reload the page and try again.',
		taskNotFound: 'That checklist item has changed. Reload the page and try again.',
		pollInvalid: 'That poll couldn’t be saved. Reload the page and try again.',
		pollOptionCount: (min: number, max: number) =>
			`A poll needs between ${min} and ${max} options.`,
		pollOptionTooLong: (max: number) => `Keep each poll option to ${max} characters or fewer.`,
		pollQuestionTooLong: (max: number) => `Keep the poll question to ${max} characters or fewer.`,
		pollOptionNotFound: 'That poll option doesn’t exist any more. Reload the page.',
		notLatestVersion:
			'This isn’t the latest version of the thread. Open the latest version and start from there.',
		draftNotFound: 'That draft doesn’t exist, or it’s someone else’s.',
		draftInvalid: (detail: string) => `This draft can’t be saved (${detail}). Reload the page.`,
		emojiInvalid: 'Pick a single emoji.',
		tooManyTags: (max: number) => `A thread can have at most ${max} tags. Remove some #tags.`,
		tagInvalid:
			'That isn’t a tag. Tags are 2 to 32 letters, numbers and hyphens, with at least one letter.',
		pinNotInProject:
			'Only threads in this channel, docs shared with it and calls held in it can be pinned here.',
		pinKindInvalid: (kind: string) => `Expected a thread, doc or call to pin, got “${kind}”.`,
		moveSameProject: 'The thread is already in that channel.',
		publicLinksOff: 'Public links are turned off for this organization. An admin can turn them on.',
		publicLinkDead: 'This link no longer works. Ask whoever shared it for a new one.',
		bookmarkTitleMissing: 'Give the bookmark a title.',
		bookmarkTitleTooLong: 'Keep the bookmark’s title to 255 characters or fewer.',
		bookmarkUrlInvalid: 'Enter a web address that starts with https:// or http://.',
		bookmarkNotFound: 'That bookmark isn’t in this channel any more.',
		bookmarkDirectionInvalid: (direction: string) =>
			`Expected to move the bookmark up or down, got “${direction}”.`,
		fileMissing: 'Choose a file to upload.',
		fileTypeNotAllowed: (name: string) =>
			`${name} isn’t a supported file type. Upload images, PDFs, text, office documents, zip, MP4, WebM or MP3.`,
		fileTooLarge: (name: string, maxBytes: number) =>
			`${name} is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`,
		feedbackNobody: 'Choose at least one person to ask.',
		feedbackCannotSee: 'That person can’t see this thread, so they can’t give feedback on it.',
		feedbackNotFound: 'That feedback request doesn’t exist, or it isn’t yours.',
		followUpTimeInvalid: 'Choose a time in the future, no more than a year from now.',
		followUpSubjectInvalid: (type: string) =>
			`Follow ups can be set on threads, comments, docs and calls, not on “${type}”.`,
		followUpNotFound: 'That follow up doesn’t exist, or it isn’t yours.',
		pinOutside: 'Pick a point on the image.',
		pinNotAnImage: 'You can only pin a comment to an image in this thread.',
		/** Resolving needs the right to comment, as in Campsite. */
		cannotResolve: 'You can read this channel but not resolve threads or comments in it.',
		cannotResolveReply: 'Only the first comment in a thread can be resolved.',
		resolutionInvalid: (detail: string) =>
			`Part of the resolution can’t be saved (${detail}). Reload the page and try again.`,
		shareNobody: 'Choose at least one person or DM.',
		shareCannotSee: (name: string) => `${name} can’t see this thread, so it can’t be sent to them.`,
		shareChatCannotSee: 'Someone in that DM can’t see this thread, so it can’t be sent there.',
		shareChatNotFound: 'That DM doesn’t exist, or you aren’t in it.',
		statusInvalid: (value: string) =>
			`Expected a status of none or feedback requested, got “${value}”.`,
		postLinkTitleMissing: 'Give the link a title.',
		postLinkTitleTooLong: 'Keep the link’s title to 255 characters or fewer.',
		postLinkUrlInvalid: 'Enter a web address that starts with https:// or http://.',
		postLinkNotFound: 'That link isn’t on this thread any more.'
	}
};
