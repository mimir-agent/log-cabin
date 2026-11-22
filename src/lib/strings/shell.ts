export const shell = {
	skipToContent: 'Skip to content',
	openNav: 'Open navigation',
	closeNav: 'Close navigation',
	back: 'Back',
	navTitle: 'Navigation',
	favorites: 'Favorites',
	projects: 'Channels',
	browseProjects: 'Browse all channels',
	/** The phone's home screen: where everything is, one tap away. */
	home: {
		search: 'Search',
		posts: 'Threads'
	},
	/** The people rail beside Home. */
	people: {
		label: 'People',
		search: 'Search people…',
		clear: 'Clear search',
		team: 'Team',
		guests: 'Guests',
		none: 'Nobody found'
	},
	/** PA-A6: shown in open tabs when a newer build is deployed. */
	updateBanner: {
		text: 'A new version is available',
		refresh: 'Refresh'
	},
	unread: (count: number) => (count === 1 ? '1 unread' : `${count} unread`),
	unreadDot: 'Unread',
	/** Markers in the sidebar: Home has posts you haven't looked at, Activity has unseen items. */
	markers: {
		homeNew: 'New posts',
		activityNew: (count: number) => (count === 1 ? '1 new in Activity' : `${count} new in Activity`)
	},
	/** Campsite's keyboard shortcuts and the sheet that lists them. */
	shortcuts: {
		sheet: {
			title: 'Keyboard shortcuts',
			description: 'They work anywhere outside a text field.',
			then: 'then'
		},
		go: {
			inbox: 'Go to Inbox',
			home: 'Go to Home',
			notes: 'Go to Docs',
			activity: 'Go to Activity',
			search: 'Search'
		},
		newPost: 'New thread or document',
		switcher: 'Jump to anything',
		help: 'Show keyboard shortcuts',
		/** The modifier key of Cmd-K: Apple's command key, or Ctrl elsewhere. */
		modKey: { apple: '⌘', other: 'Ctrl' }
	},
	/** The sidebar's New button and the menu it opens (also the phone's compose +). */
	create: {
		/** The button's label. */
		button: 'New',
		/** Names the button and the menu for screen readers. */
		menuLabel: 'Start a thread or a document',
		/** The two titles are fixed wording. */
		post: { title: 'New thread', line: 'Updates, proposals, topics and more' },
		doc: { title: 'New document', line: 'A page you write and keep editing' }
	}
};
