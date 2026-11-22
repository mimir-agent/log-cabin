/**
 * Releases inside the app: the Updates section of Settings › Organization, where admins turn on
 * the update check, and the sidebar's changelog menu, with the newest releases bundled
 * into this build.
 */
export const updates = {
	settings: {
		title: 'Updates',
		/** Under the title. Updates are never installed from the app, so say who installs them. */
		hint: (appName: string) =>
			`${appName} doesn’t update itself. Whoever deployed it installs each new release.`,
		running: (version: string) => `This organization runs version ${version}.`,
		toggle: 'Check for updates',
		/**
		 * The check is a plain GET with nothing from the organization in it, but Cloudflare adds a
		 * CF-Worker header naming the zone to every request a Worker sends, and the hint includes that.
		 */
		toggleHint:
			'Once a day, this site downloads the public list of releases, and admins see a notice when there’s a newer one. The request carries nothing from this organization’s data. Cloudflare adds a header naming the domain this site is on, as it does for every request a Worker sends.',
		/** The toggle is hidden when the build has no UPDATE_FEED_URL. Admins see this line instead. */
		unconfigured:
			'This deployment has no release list set (the UPDATE_FEED_URL variable), so it can’t check for updates.',
		status: {
			checking: 'Checking…',
			notChecked: 'Not checked yet',
			upToDate: (version: string) => `Up to date (v${version})`,
			available: (latest: string) => `Version ${latest} is available`,
			/** `when` is a formatted time, such as time.long's. */
			lastChecked: (when: string) => `Last checked ${when}`,
			unreachable: 'Couldn’t reach the release list'
		},
		links: {
			releaseNotes: 'Release notes',
			howToUpdate: 'How to update'
		}
	},
	/** Campsite's ChangelogDropdown: a sidebar button that opens the newest 3 releases. */
	changelog: {
		label: 'Changelog',
		title: 'What’s new',
		release: (version: string) => `Version ${version}`,
		empty: 'No releases yet.',
		viewAll: 'View all',
		/** The dot on the button, for admins, when the update check found a newer release. */
		updateDot: (latest: string) => `Version ${latest} is available`
	}
};
