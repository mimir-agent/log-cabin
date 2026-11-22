export const chat = {
	nav: {
		chat: 'Messages'
	},
	list: {
		title: 'Messages',
		empty: 'No DMs yet.',
		newMessage: 'New DM',
		newGroup: 'New group DM',
		unread: (n: number) => (n === 1 ? '1 unread message' : `${n} unread messages`),
		/** For a thread marked unread by hand. */
		markedUnread: 'Marked unread',
		noMessages: 'No messages yet',
		pick: 'Select a DM'
	},
	start: {
		title: 'New DM',
		dmHeading: 'Message someone',
		/** On a profile and a person's hover card (Campsite's). */
		message: 'Message',
		groupHeading: 'Start a group DM',
		groupName: 'Group name',
		groupNamePlaceholder: 'Name (optional)',
		firstMessage: 'Write the first message (optional)',
		attach: 'Attach files',
		attached: (names: string[]) => `Attached: ${names.join(', ')}`,
		groupPeople: 'People',
		groupSubmit: 'Start group DM',
		nobody: 'There’s nobody you can message yet.'
	},
	thread: {
		/** A thread's name when it has no title, from the people in it (Campsite's). */
		justYou: 'Just you',
		twoNames: (a: string, b: string) => `${a} and ${b}`,
		nameAndOthers: (first: string, others: number) =>
			`${first} and ${others} ${others === 1 ? 'other' : 'others'}`,
		members: (n: number) => (n === 1 ? '1 member' : `${n} members`),
		localTime: (time: string) => `${time} local time`,
		placeholder: 'Write a message…',
		send: 'Send',
		save: 'Save',
		cancel: 'Cancel',
		edit: 'Edit',
		delete: 'Delete',
		confirmDelete: 'Delete this message?',
		reply: 'Reply',
		/** The message menu (Campsite's). */
		startPost: 'Start a thread…',
		copyText: 'Copy text',
		copied: 'Copied',
		/** Told to a screen reader on a touch screen, where actions open on a long press. */
		longPress: 'Touch and hold for actions',
		/** In place of the composer in a deactivated member's DM. */
		deactivated: (name: string) =>
			`${name}’s account is deactivated. You can read this DM but can’t reply.`,
		/** Over the composer while new messages wait below (Campsite's). */
		newMessages: 'New messages',
		download: 'Download',
		/** Under a DM while the other person's notifications are held (Campsite's). */
		paused: (name: string) => `${name} has notifications paused`,
		notifyAnyway: 'Notify anyway',
		notified: (name: string) => `Notified ${name}`,
		replyingTo: (name: string) => `Replying to ${name}`,
		/** Under a reply to the viewer's message. */
		replyingToYou: 'Replying to you',
		/** Under the viewer's reply to their own message. */
		replyingToYourself: 'Replying to yourself',
		/** In the bar over the box while answering the viewer's own message. */
		replyingToYourMessage: 'Replying to your message',
		/** On each file waiting in the box to be sent. */
		removeAttachment: 'Remove attachment',
		deleted: 'Message deleted',
		edited: 'edited',
		/** Under a message of yours still on its way after a couple of seconds. */
		stillSending: 'Still sending…',
		/** Under a message of yours that didn't reach the server. */
		notSent: 'Not sent ·',
		retry: 'Retry',
		empty: 'No messages yet.',
		typing: (names: string[]) =>
			names.length === 1 ? `${names[0]} is typing…` : `${names.join(', ')} are typing…`,
		viewing: (names: string[]) => `Here now: ${names.join(', ')}`,
		react: 'Add reaction',
		reactWith: (emoji: string) => `React with ${emoji}`,
		when: (ms: number, timeZone: string) =>
			new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone })
	},
	/** On a file's card and a Lottie animation. */
	files: {
		qrCode: 'Show QR code',
		openInApp: 'Open in app',
		animation: (name: string) => `Animation: ${name}`
	},
	/**
	 * A project made with "Chat format" has one chat for its members, beside its threads.
	 */
	channel: {
		option: 'Chat format: give the channel’s members a chat of their own, beside its threads',
		tabsLabel: 'Channel sections',
		posts: 'Threads',
		chat: 'Chat'
	},
	/**
	 * The thread's menu and what it opens, after Campsite's ChatThreadOverflowMenu and its
	 * dialogs.
	 */
	menu: {
		label: 'DM options',
		favorite: 'Favorite',
		unfavorite: 'Favorited',
		markUnread: 'Mark unread',
		markRead: 'Mark read',
		notifications: 'Notification settings',
		edit: 'Edit name and picture',
		people: 'Add or remove people',
		leave: 'Leave DM',
		delete: 'Delete'
	},
	levels: {
		title: 'Notification settings',
		description: 'Choose when new messages in this DM notify you.',
		all: 'All new messages',
		allHint: 'Get notified about every new message.',
		mentions: 'Mentions and replies',
		mentionsHint: 'Get notified only when someone mentions you or replies to you.',
		none: 'Off',
		noneHint: 'Get no notifications from this DM.',
		save: 'Save'
	},
	editGroup: {
		title: 'Edit DM',
		name: 'Name',
		namePlaceholder: 'Untitled DM',
		nameHint: 'Leave it empty to name the DM after the people in it.',
		picture: 'Picture',
		choosePicture: 'Choose a picture',
		removePicture: 'Remove picture',
		save: 'Save'
	},
	people: {
		title: 'DM members',
		add: 'Add people',
		addSubmit: 'Add',
		remove: (name: string) => `Remove ${name}`,
		you: 'You',
		nobodyToAdd: 'Everyone you can message is already here.',
		/** Under the add picker in a DM: adding someone starts a new chat. */
		dmNote: 'Adding someone starts a new group DM; this DM stays as it is.'
	},
	leave: {
		title: 'Leave this DM?',
		description: 'You’ll stop getting its messages. The others can still read what you sent.',
		confirm: 'Leave DM'
	},
	deleteThread: {
		title: 'Delete this DM?',
		description: 'This deletes every message in the DM, for everyone. You can’t undo it.',
		confirm: 'Delete DM',
		done: 'DM deleted'
	},
	/** "Delete attachments…" on a message (Campsite's). */
	deleteAttachments: {
		menu: 'Delete attachments…',
		title: 'Delete attachments',
		description: 'Choose the files to delete. The message and its other files stay.',
		confirm: 'Delete'
	},
	/** Lines in a thread's timeline for who joined and who went (Campsite's). */
	timeline: {
		added: (actor: string, names: string[]) => `${actor} added ${sentence(names)} to this DM.`,
		removed: (actor: string, names: string[]) =>
			`${actor} removed ${sentence(names)} from this DM.`,
		left: (actor: string) => `${actor} left this DM.`
	},
	errors: {
		threadNotFound: 'That DM doesn’t exist, or you’re not in it.',
		messageNotFound: 'That message isn’t in this DM.',
		notYourMessage: 'You can edit or delete only your own messages.',
		personUnavailable: 'One of those people isn’t an active member.',
		guestOutsideProjects: 'Guests can message only people who share a channel with them.',
		dmSelf: 'You can’t message yourself.',
		titleTooLong: 'Keep the group name under 100 characters.',
		noOneElse: 'Add at least one other person.',
		fileMissing: 'Choose a file to upload.',
		levelUnknown: (level: string) =>
			`Expected a notification level of all, mentions or none, got “${level}”.`,
		onlyGroups: 'Only a group DM can be changed this way.',
		noOneNew: 'Choose someone who isn’t in this DM yet.',
		removeSelf: 'To take yourself out, leave the DM.',
		notInThread: 'That person isn’t in this DM.',
		cannotDelete: 'Only admins and members can delete a DM.',
		attachmentNotInMessage: 'Choose files that are in this message.',
		cannotNotifyAnyway:
			'“Notify anyway” is for the sender of the latest message in a DM, once, while the other person’s notifications are paused.',
		dmDeactivated: 'This person’s account is deactivated, so the DM can’t take new messages.',
		noPicture: 'This DM has no picture.',
		favoriteSubjectInvalid: (type: string) =>
			`Expected a doc or a thread to favorite, got “${type}”.`
	}
};

const list = new Intl.ListFormat('en', { type: 'conjunction' });

/** "Ada", "Ada and Bo", "Ada, Bo, and Cy". */
function sentence(names: string[]): string {
	return list.format(names);
}
