import { browser } from '$app/env';

/** Chromium's install event: `prompt()` opens the browser's own install dialog, once. */
type InstallEvent = Event & { prompt(): Promise<unknown> };

/**
 * Chromium's install prompt, held from the moment it fires: that can be before any page that
 * offers it has mounted, and it fires once per visit. Null when the browser hasn't offered one
 * (another browser, or the app is installed already) or it has been used.
 */
export const installPrompt = $state<{ event: InstallEvent | null }>({ event: null });

if (browser) {
	addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		installPrompt.event = event as InstallEvent;
	});
	addEventListener('appinstalled', () => (installPrompt.event = null));
}
