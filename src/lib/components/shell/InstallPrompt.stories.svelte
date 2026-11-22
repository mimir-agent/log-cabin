<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, within } from 'storybook/test';
	import { installPrompt } from '#lib/install-prompt.svelte.js';
	import { pwa } from '#lib/strings/pwa.js';
	import InstallPrompt, { dismissedKey } from './InstallPrompt.svelte';

	// The prompt reads the browser, not props: Chromium's install event, Safari's
	// `navigator.standalone` and what this browser remembers. Each story sets all three, and
	// puts them back afterwards.
	function withBrowserState({ offer = false, ios = false, dismissed = false }) {
		return () => {
			if (offer) {
				installPrompt.event = Object.assign(new Event('beforeinstallprompt'), {
					prompt: async () => ({ outcome: 'dismissed' })
				});
			}
			if (ios) Object.defineProperty(navigator, 'standalone', { value: false, configurable: true });
			if (dismissed) localStorage.setItem(dismissedKey, 'dismissed');
			else localStorage.removeItem(dismissedKey);
			return () => {
				installPrompt.event = null;
				Reflect.deleteProperty(navigator, 'standalone');
				localStorage.removeItem(dismissedKey);
			};
		};
	}

	// No autodocs: the stories share the browser's state, so they can't all render on one page.
	const { Story } = defineMeta({
		title: 'Shell/InstallPrompt',
		component: InstallPrompt,
		args: { appName: 'Log Cabin' }
	});
</script>

<Story
	name="Chromium offer"
	beforeEach={withBrowserState({ offer: true })}
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText(pwa.install.text('Log Cabin'))).toBeVisible();
		await expect(canvas.getByRole('button', { name: pwa.install.install })).toBeVisible();
	}}
/>

<Story
	name="iOS hint"
	beforeEach={withBrowserState({ ios: true })}
	play={async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByText(pwa.ios.text('Log Cabin'))).toBeVisible();
	}}
/>

<!-- Dismissed in this browser: nothing shows, even with an install offer waiting. -->
<Story
	name="Dismissed"
	beforeEach={withBrowserState({ offer: true, dismissed: true })}
	play={async ({ canvasElement }) => {
		// Past the frame where the prompt reads what this browser remembers.
		await new Promise(requestAnimationFrame);
		await expect(within(canvasElement).queryByRole('status')).toBeNull();
	}}
/>
