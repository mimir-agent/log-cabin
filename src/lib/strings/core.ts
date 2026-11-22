import type { Role } from '../server/db/schema';

export const core = {
	appName: 'Log Cabin',
	nav: {
		home: 'Home',
		label: 'Main'
	},
	actions: {
		/** The overflow button that opens a menu of the less common actions. */
		more: 'More actions',
		/** Closes a pane or dialog; its key is Esc. */
		close: 'Close'
	},
	home: {
		title: 'Home',
		welcome: (name: string) => `Welcome, ${name}.`,
		empty: 'Nothing here yet.'
	},
	roles: {
		admin: 'Admin',
		member: 'Member',
		viewer: 'Viewer',
		guest: 'Guest'
	} satisfies Record<Role, string>,
	setup: {
		title: 'Set up Log Cabin',
		intro: 'Name your organization and create its first admin account, which will be yours.',
		orgName: 'Organization name',
		adminName: 'Your name',
		email: 'Your email',
		token: 'Setup token',
		submit: 'Create organization',
		errors: {
			orgNameMissing: 'Enter the organization’s name.',
			adminNameMissing: 'Enter your name.',
			emailInvalid: 'Enter an email address like name@example.com.',
			tokenWrong:
				'That setup token is wrong. Use the one printed when you deployed. It’s also stored as the SETUP_TOKEN secret.'
		}
	},
	devLogin: {
		title: 'Dev sign-in',
		intro: 'Signs in as any user without email. Only available in development with DEV_LOGIN=1.',
		email: 'Email',
		name: 'Name',
		role: 'Role',
		submit: 'Sign in',
		errors: {
			emailInvalid: 'Enter an email address like name@example.com.',
			nameMissing: 'Enter a name.',
			roleInvalid: 'Choose one of the listed roles.'
		}
	},
	errors: {
		notFound: 'Not found',
		roleRequired: (role: Role) => `You need the ${role} role or higher to see this page.`,
		/** A toast when a change didn't reach the server and was undone. */
		notSaved: 'That didn’t save. Check your connection and try again.',
		/** A new message or comment came with an id that isn't a fresh one of its own. */
		idRefused: 'That couldn’t be saved. Reload the page and try again.'
	},
	/**
	 * The save state: one quiet word, never a toast. A live note shows it in the title bar (desktop:
	 * the right cluster's first item; phone: the second line under the bar's title, 12 px, so 18
	 * characters at most). The thread composer, edit and draft pages show the same words in their head.
	 * `saving` appears only once a change has waited more than 500 ms for the server; a quicker save
	 * goes straight to `saved`. `failed` is in the danger colour and stays until the next save works.
	 */
	saveState: {
		saving: 'Saving…',
		saved: 'Saved',
		offline: 'Offline',
		failed: 'Couldn’t save'
	},
	/** The page shown in place of one that failed to load. */
	errorPage: {
		// A thread or note 404s once it is deleted; it also 404s for someone without access.
		postGone: {
			title: 'This thread was deleted',
			description: 'Or it’s in a channel you don’t have access to.'
		},
		noteGone: {
			title: 'This doc was deleted',
			description: 'Or it hasn’t been shared with you.'
		},
		home: 'Go home'
	}
};
