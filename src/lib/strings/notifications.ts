import type { NotificationKind } from '../server/db/schema/notifications';

export const notifications = {
	nav: {
		inbox: 'Inbox',
		activity: 'Activity',
		settings: 'Notifications'
	},
	/** One line per notification: "<actor> <what happened>". A reminder has no actor but you. */
	what: {
		mention: 'mentioned you',
		comment: 'commented on a thread you follow',
		reply: 'replied to your comment',
		message: 'sent you a message',
		post: 'started a thread in a channel you follow',
		note: 'shared a doc with you',
		call: 'called you',
		feedback: 'asked for your feedback',
		join_request: 'asked to join',
		reaction: 'reacted to what you wrote',
		added_to_project: 'added you to a channel',
		project_renamed: 'renamed a channel you follow',
		project_archived: 'archived a channel you follow',
		post_moved: 'moved a thread into a channel you follow',
		comment_resolved: 'resolved your comment',
		post_resolved: 'resolved a thread you follow',
		post_resolved_from_comment: 'resolved a thread with your comment'
	} satisfies Record<Exclude<NotificationKind, 'follow_up'>, string>,
	/** A comment on a note, told to its author and the others who commented on it. */
	noteComment: 'commented on a doc',
	/** What happened, for a notification of this kind about this inbox item. */
	whatOf: (kind: Exclude<NotificationKind, 'follow_up'>, itemKey: string): string =>
		kind === 'comment' && itemKey.startsWith('note:')
			? notifications.noteComment
			: notifications.what[kind],
	line: (actor: string, kind: NotificationKind, itemKey: string) =>
		kind === 'follow_up'
			? notifications.reminder
			: `${actor} ${notifications.whatOf(kind, itemKey)}`,
	/** An inbox row's last line, under the actor's name and the item's title. */
	preview: (kind: NotificationKind, itemKey: string) =>
		kind === 'follow_up' ? notifications.reminder : notifications.whatOf(kind, itemKey),
	reminder: 'Follow up',
	/** Under the line: the item's title, then how many more notifications it has. */
	detail: (title: string | null, more: number) =>
		[title, more === 0 ? null : more === 1 ? '1 more' : `${more} more`].filter(Boolean).join(' · '),
	inbox: {
		title: 'Inbox',
		tabs: { unread: 'Unread', read: 'Read', archived: 'Archived' },
		tabsLabel: 'Inbox views',
		markRead: 'Mark read',
		/** The page header's button that archives the inbox items about the page. */
		markDone: 'Mark done',
		markAllRead: 'Mark all read',
		/** Under an inbox row made while the person's schedule or a pause held push and email. */
		held: 'Not pushed or emailed: notifications were paused or outside your schedule',
		archive: 'Archive',
		/** How long ago, in the inbox's time column: "5m ago", "3h ago", "2d ago". */
		ago: (at: number, now = Date.now()) => {
			const rtf = new Intl.RelativeTimeFormat('en', { style: 'narrow', numeric: 'auto' });
			const minutes = Math.round((at - now) / 60_000);
			if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
			const hours = Math.round(minutes / 60);
			if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
			return rtf.format(Math.round(hours / 24), 'day');
		},
		dismiss: 'Dismiss',
		done: 'Done',
		snooze: 'Snooze',
		reminders: 'Follow ups',
		empty: {
			unread: 'You’re all caught up.',
			read: 'Nothing read yet.',
			archived: 'Nothing archived.'
		}
	},
	activity: {
		title: 'Activity',
		intro: 'Recent threads and comments in the channels you can see.',
		posted: (actor: string) => `${actor} started a thread`,
		commented: (actor: string) => `${actor} commented`,
		empty: 'No activity yet.'
	},
	settings: {
		title: 'Notification settings',
		kindsHeading: 'Email and push',
		kindsIntro:
			'Everything goes to your inbox. Choose what also reaches you by email, if it’s still unread after 10 minutes, and by push notification.',
		kind: 'Notification',
		email: 'Email',
		push: 'Push',
		kinds: {
			mention: 'Mentions',
			comment: 'Comments on threads you follow',
			reply: 'Replies to your comments',
			message: 'Direct and group messages',
			post: 'New threads in channels you follow',
			note: 'Docs shared with you',
			call: 'Calls you’re invited to, and calls you missed',
			feedback: 'Requests for your feedback on a thread',
			follow_up: 'Follow ups you set',
			join_request: 'People asking to join (admins only)',
			reaction: 'Reactions to your threads, comments and docs',
			added_to_project: 'Being added to a channel',
			project_renamed: 'Channels you follow being renamed',
			project_archived: 'Channels you follow being archived',
			post_moved: 'Threads moved into channels you follow',
			comment_resolved: 'Your comments being resolved',
			post_resolved: 'Threads you follow being resolved',
			post_resolved_from_comment: 'Threads resolved with your comment'
		} satisfies Record<NotificationKind, string>,
		digestHeading: 'Digests',
		digestIntro:
			'Emails that list new threads in the channels you belong to or follow, and new threads you follow, each with the comment that got the most reactions. When nothing is new, no email comes.',
		dailyDigest: 'Daily digest',
		dailyDigestDescription: 'Other people’s threads from the past day.',
		weeklyDigest: 'Weekly summary',
		weeklyDigestDescription: 'The past week’s threads and new channels.',
		hour: 'At',
		weekday: 'On',
		weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
		timezone: 'Timezone',
		save: 'Save',
		saved: 'Saved.',
		scheduleHeading: 'Notification schedule',
		scheduleIntro:
			'Outside these hours nothing is pushed or emailed to you, and it isn’t sent later. Your inbox still gets everything.',
		scheduleLabel: 'When to notify you',
		scheduleModes: { always: 'At all times', custom: 'On a schedule' },
		days: 'Days',
		weekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
		from: 'From',
		to: 'To',
		pauseHeading: 'Pause notifications',
		pauseIntro:
			'Nothing is pushed or emailed until the time you choose. Anything you miss stays in your inbox.',
		pauseMenu: 'Pause',
		pausePresets: {
			thirtyMinutes: 'For 30 minutes',
			hour: 'For 1 hour',
			twoHours: 'For 2 hours',
			tomorrow: 'Until tomorrow',
			nextWeek: 'Until next week'
		},
		pauseUntil: 'Or pause until',
		pauseUntilSubmit: 'Pause',
		pausedUntil: (when: string) => `Paused until ${when}.`,
		notPaused: 'Not paused.',
		resume: 'Resume notifications',
		errors: {
			timezoneInvalid: 'Choose a timezone from the list.',
			hourInvalid: 'Choose an hour from the list.',
			weekdayInvalid: 'Choose a day from the list.',
			scheduleDaysMissing: 'Choose at least one day for your schedule.',
			scheduleTimesInvalid: 'Choose a start time before the end time.',
			pauseInvalid: 'Choose a time later than now.'
		}
	},
	push: {
		heading: 'Push notifications on this device',
		unsupported: 'This browser doesn’t support push notifications.',
		notConfigured:
			'Push notifications aren’t set up on this site yet. An admin needs to add the VAPID keys.',
		denied:
			'Your browser blocks notifications from this site. Allow them in your browser settings, then try again.',
		on: 'Push is on for this device.',
		off: 'Push is off for this device.',
		enable: 'Turn on push',
		disable: 'Turn off push',
		failed: (detail: string) => `Couldn’t change push: ${detail}`,
		/** iPhone or iPad in a Safari tab: push works only in the app added to the Home Screen. */
		installFirst:
			'On iPhone and iPad, push works only in the app on your Home Screen. Tap Share, then Add to Home Screen, then open the app from there and turn push on.',
		/** PA-A5 */
		test: 'Send a test push',
		testSent: 'Sent. It should reach this device in a few seconds.',
		testNone: 'This device isn’t subscribed. Turn on push first.',
		testFailed: (detail: string) => `Couldn’t send a test push: ${detail}`,
		testTitle: 'Test push',
		testBody: 'Push notifications are working on this device.',
		help: {
			heading: 'Not getting push notifications?',
			intro: 'Check these, then send a test push.',
			iosHeading: 'iPhone and iPad',
			ios: [
				'Push works only in the app on your Home Screen. In Safari, tap Share, then Add to Home Screen.',
				'Open the app from your Home Screen and turn on push here.',
				'In Settings > Notifications, make sure the app is allowed to send notifications.'
			],
			androidHeading: 'Android',
			android: [
				'In Chrome, tap the ••• menu, then Add to Home screen or Install app.',
				'Open the app and turn on push here.',
				'In Settings > Apps, find the app and make sure its notifications are on.',
				'If push arrives late, exempt the app from battery saver.'
			],
			stillStuck: 'Still nothing? Ask an admin to check that push is set up on this site.'
		},
		prompt: {
			text: 'Get notifications on this device as well as in your inbox.',
			enable: 'Turn on notifications',
			dismiss: 'Not now'
		}
	},
	email: {
		unreadSubject: (count: number) =>
			count === 1 ? 'You have 1 unread notification' : `You have ${count} unread notifications`,
		unreadIntro: 'Still unread in your inbox:',
		open: 'Open your inbox',
		footer: (url: string) => `Change what you get by email: ${url}`
	},
	digests: {
		dailySubject: (count: number) =>
			count === 1 ? '1 thread you may have missed' : `${count} threads you may have missed`,
		dailyIntro: 'New in the last day:',
		weeklySubject: (orgName: string) => `${orgName} weekly summary`,
		weeklyIntro: 'New in the last week:',
		posts: 'Threads',
		projects: 'New channels',
		post: (author: string, title: string, project: string) =>
			`${author} started the thread “${title}” in ${project}`,
		untitled: 'Untitled',
		topComment: (author: string, text: string) => `${author}: ${text}`,
		project: (name: string, creator: string) => `${name}, created by ${creator}`,
		footer: (url: string) => `Turn digests off, or change when they come: ${url}`
	},
	/**
	 * Campsite's summary sentences, one per kind, with the title or channel in the sentence
	 * (`notification_summary` in Campsite's models). The inbox row, the push title and a one-item
	 * mail's subject read these. `title` is the thread, doc or call title, or `untitled*` below.
	 */
	summary: {
		/** A private channel's name carries Campsite's lock mark. */
		channel: (name: string, isPrivate: boolean) => (isPrivate ? `🔒 ${name}` : name),
		untitledPost: (author: string) => `${author}’s thread`,
		untitledNote: (author: string) => `${author}’s doc`,
		mentionIn: (actor: string, title: string) => `${actor} mentioned you in ${title}`,
		mentionInComment: (actor: string) => `${actor} mentioned you in a comment`,
		mentionInReply: (actor: string) => `${actor} mentioned you in a reply`,
		commentOn: (actor: string, title: string) => `${actor} commented on ${title}`,
		/** Whose comment a reply answers, as the recipient reads it. */
		whose: {
			yours: 'your comment',
			theirs: 'their comment',
			named: (author: string) => `${author}’s comment`
		},
		replyTo: (actor: string, whose: string) => `${actor} replied to ${whose}`,
		/** `emoji` is the emoji itself, or a custom emoji's `:name:`. */
		reaction: (actor: string, emoji: string, what: 'post' | 'comment' | 'reply' | 'note') =>
			`${actor} reacted ${emoji} to your ${what === 'note' ? 'doc' : what === 'post' ? 'thread' : what}`,
		postedIn: (actor: string, channel: string) => `${actor} started a thread in ${channel}`,
		iteratedOn: (actor: string, title: string) => `${actor} iterated on ${title}`,
		feedback: (actor: string) => `${actor} requested your feedback`,
		followUp: (title: string) => `Follow up on ${title}`,
		shared: (actor: string, title: string) => `${actor} shared ${title} with you`,
		addedTo: (actor: string, channel: string) => `${actor} added you to ${channel}`,
		archived: (actor: string, channel: string) => `${actor} archived ${channel}`,
		/** Log Cabin's own kinds, which Campsite doesn't have, in the same shape. */
		renamed: (actor: string, channel: string) => `${actor} renamed a channel to ${channel}`,
		moved: (actor: string, title: string, channel: string) =>
			`${actor} moved ${title} to ${channel}`,
		callSummaryReady: 'Your call summary is ready',
		/** Resolving, as Campsite words it. `title` is the thread title or `untitledPost`. */
		commentResolved: (actor: string) => `${actor} resolved your comment`,
		postResolved: (actor: string, title: string) => `${actor} resolved ${title}`,
		postResolvedFromComment: (actor: string, title: string) =>
			`${actor} resolved ${title} with your comment`
	},
	/** The resolve kinds' preview. Move each into the mail with its kind when it lands. */
	resolveKinds: {
		/** The preview of a thread resolved with a comment and nothing written: "<author>’s comment". */
		previewFromComment: (author: string) => `${author}’s comment`
	},
	/** Settings rows for the kinds lane N adds. Move each into `settings.kinds` with its kind. */
	newKinds: {
		iteration: 'New versions of threads you follow',
		call_summary: 'Summaries of your calls'
	},
	/**
	 * The body preview under a push title and in mail: "<prefix>: <excerpt>". The excerpt is the
	 * body's plain text, cut to 140 characters at a word, and never from a body the recipient
	 * can't read (then show the prefix alone, or nothing).
	 */
	bodyPreview: {
		mentioned: (actor: string) => `${actor} mentioned you`,
		posted: (actor: string) => `${actor} started a thread`,
		/** Every other kind's prefix is the actor's name alone. */
		line: (prefix: string, excerpt: string) => `${prefix}: ${excerpt}`
	},
	/** A message's push: the title is the chat's name, the body this preview. */
	messagePreview: {
		/** "You" when the reader sent it. A 1:1 chat shows the text without a name. */
		you: 'You',
		text: (sender: string, text: string) => `${sender}: ${text}`,
		attachment: (sender: string) => `${sender} sent an attachment`,
		call: (sender: string) => `${sender} started a call`,
		deleted: 'Message deleted'
	},
	/** The Later view, mark unread, unarchive and archive all, as in Campsite's inbox. */
	inboxActions: {
		later: 'Later',
		laterEmpty: 'When you follow up on an item, it shows up here.',
		followUp: 'Follow up',
		markUnread: 'Mark unread',
		unarchive: 'Unarchive',
		/** In the inbox's menu; each opens the confirm below. */
		archiveRead: 'Archive read notifications',
		archiveAll: 'Archive all notifications',
		confirmTitle: 'Archive notifications',
		confirmRead:
			'Archive every read notification in this view? They move to Archived, where you can unarchive them.',
		confirmAll:
			'Archive every notification in this view? They move to Archived, where you can unarchive them.',
		confirm: 'Archive',
		cancel: 'Cancel'
	},
	/** The unread-notification mail, laid out per kind as Campsite's bundled mail is. */
	bundle: {
		subject: {
			/** One notification: its summary sentence is the subject. */
			messagesFrom: (chat: string) => `Unread messages from ${chat}`,
			notifications: (count: number, orgName: string) =>
				count === 1
					? `1 unread notification in ${orgName}`
					: `${count} unread notifications in ${orgName}`,
			messages: (orgName: string) => `Unread messages in ${orgName}`,
			both: (orgName: string) => `Unread notifications and messages in ${orgName}`
		},
		/** Over the list, when there is more than one. */
		intro: (count: number, orgName: string) =>
			`You have ${count} unread notifications in ${orgName}.`,
		buttons: {
			post: 'View thread',
			comment: 'View comment',
			feedback: 'Add feedback',
			followUp: 'Follow up',
			channel: 'View channel',
			note: 'View doc',
			call: 'View call'
		},
		readMore: 'Read more',
		postedIn: (channel: string) => `Started a thread in ${channel}`,
		messagesFrom: (chat: string) => `You have unread messages from ${chat}`,
		attachments: (count: number) => (count === 1 ? '1 attachment' : `${count} attachments`),
		/** A call card's meta line: date, length, people. */
		callMeta: (date: string, length: string | null, people: string[]) =>
			[date, length, people.join(', ')].filter(Boolean).join(' · ')
	},
	/** Digest additions: the posters under the date, as Campsite's facepile byline. */
	digestByline: (posts: number, posters: string[]) => {
		const shown = posters.slice(0, 3);
		const rest = posters.length - shown.length;
		if (rest === 1) shown.push(posters[3]);
		else if (rest > 1) shown.push(`${rest} others`);
		const names = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(shown);
		return `${posts === 1 ? '1 thread' : `${posts} threads`} by ${names}`;
	},
	/** Account and admin mails Campsite sends. Each has a subject, a paragraph and a button. */
	accountMail: {
		passwordChanged: {
			subject: 'Your password has changed',
			intro: (orgName: string) => `Your password for ${orgName} was changed.`,
			note: (orgName: string) =>
				`If you didn’t change it, reset your password from the sign-in page and tell an admin of ${orgName}.`,
			button: 'Open Log Cabin'
		},
		memberRemoved: {
			subject: (orgName: string) => `You were removed from ${orgName}`,
			intro: (orgName: string) =>
				`You were removed from ${orgName} on Log Cabin and can no longer sign in to it.`,
			note: 'If you think that’s a mistake, ask an admin there.'
		},
		/** To each admin, once per join. */
		joined: {
			subject: (name: string, orgName: string) => `${name} joined ${orgName}`,
			byLink: (name: string, email: string, orgName: string) =>
				`${name} (${email}) joined ${orgName} with an invitation link.`,
			byGuestLink: (name: string, email: string, orgName: string, channel: string) =>
				`${name} (${email}) joined ${orgName} as a guest in ${channel} with an invitation link.`,
			byDomain: (name: string, email: string, orgName: string) =>
				`${name} (${email}) joined ${orgName} with their email domain.`,
			button: 'Manage people'
		}
	},
	errors: {
		itemMissing: 'Choose an inbox item first.',
		pageMissing: 'Couldn’t tell which page this is. Reload it and try again.',
		subscriptionInvalid:
			'This device’s push subscription is incomplete. Turn push off, then on again.'
	}
};
