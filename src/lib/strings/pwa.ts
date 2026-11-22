/** The installed app: the offline page and the install prompts. */
export const pwa = {
	offline: {
		title: 'You’re offline',
		body: 'This page needs a connection. Once you’re back online, try again.',
		retry: 'Try again'
	},
	install: {
		text: (appName: string) => `Install ${appName} on this device to open it like an app.`,
		install: 'Install',
		dismiss: 'Not now'
	},
	/** iOS has no install prompt: Add to Home Screen is in Safari's Share menu. */
	ios: {
		text: (appName: string) => `To install ${appName}, tap Share, then Add to Home Screen.`,
		dismiss: 'Got it'
	}
};
