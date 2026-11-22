export const search = {
	nav: {
		search: 'Search'
	},
	page: {
		title: 'Search',
		label: 'Search everything',
		placeholder: 'Search threads, docs, calls, channels, messages and people',
		submit: 'Search',
		kindsLabel: 'What to search',
		kinds: {
			all: 'All',
			post: 'Threads',
			comment: 'Comments',
			note: 'Docs',
			member: 'People',
			message: 'Messages',
			project: 'Channels',
			call: 'Calls'
		},
		kindOf: {
			post: 'Thread',
			comment: 'Comment',
			note: 'Doc',
			member: 'Person',
			message: 'Message',
			project: 'Channel',
			call: 'Call'
		},
		start: 'Type a word to search.',
		none: (q: string) => `Nothing matches “${q}”.`,
		untitled: 'Untitled',
		untitledCall: 'Untitled call',
		archived: '(Archived)',
		showingFor: 'Showing results for',
		searchInstead: 'Search instead for'
	},
	quick: {
		label: 'Quick switcher',
		placeholder: 'Jump to a channel, person or page…',
		projects: 'Channels',
		people: 'People',
		recent: 'Recent',
		results: 'Results',
		searchFor: (q: string) => `Search for “${q}”`
	}
};
