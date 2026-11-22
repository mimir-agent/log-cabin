import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import '../../../app.css';
import { pwa } from '#lib/strings/pwa.js';
import { installPrompt } from '#lib/install-prompt.svelte.js';
import InstallPrompt from './InstallPrompt.svelte';

/** What Chromium fires when the app can be installed; `prompt` opens its install dialog. */
function offerInstall() {
	const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
		prompt: vi.fn(async () => ({ outcome: 'accepted' }))
	});
	window.dispatchEvent(event);
	return event;
}

/** Safari on iOS, in the browser rather than opened from the home screen. */
function beIosSafari() {
	Object.defineProperty(navigator, 'standalone', { value: false, configurable: true });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
	installPrompt.event = null;
	Reflect.deleteProperty(navigator, 'standalone');
});

describe('the install prompt', () => {
	it('offers the browser’s install dialog, holding back the browser’s own banner', async () => {
		render(InstallPrompt, { appName: 'Acme' });
		const event = offerInstall();
		expect(
			event.defaultPrevented,
			'beforeinstallprompt should be preventDefault()ed, so Chromium holds back its own install banner'
		).toBe(true);
		await expect.element(page.getByText(pwa.install.text('Acme'))).toBeVisible();
		await page.getByRole('button', { name: pwa.install.install }).click();
		expect(event.prompt).toHaveBeenCalledOnce();
		await expect.element(page.getByText(pwa.install.text('Acme'))).not.toBeInTheDocument();
	});

	it('stays away once dismissed, on later visits too', async () => {
		const first = render(InstallPrompt, { appName: 'Acme' });
		offerInstall();
		await page.getByRole('button', { name: pwa.install.dismiss }).click();
		await expect.element(page.getByText(pwa.install.text('Acme'))).not.toBeInTheDocument();
		first.unmount();

		render(InstallPrompt, { appName: 'Acme' });
		offerInstall();
		await expect.element(page.getByText(pwa.install.text('Acme'))).not.toBeInTheDocument();
	});

	it('says nothing in a browser that offers no install', async () => {
		render(InstallPrompt, { appName: 'Acme' });
		await expect.element(page.getByRole('status')).not.toBeInTheDocument();
	});

	it('tells iOS Safari users how to add the app to the home screen, until dismissed', async () => {
		beIosSafari();
		const first = render(InstallPrompt, { appName: 'Acme' });
		await expect.element(page.getByText(pwa.ios.text('Acme'))).toBeVisible();
		await page.getByRole('button', { name: pwa.ios.dismiss }).click();
		await expect.element(page.getByText(pwa.ios.text('Acme'))).not.toBeInTheDocument();
		first.unmount();

		render(InstallPrompt, { appName: 'Acme' });
		await expect.element(page.getByRole('status')).not.toBeInTheDocument();
	});

	// It shows on phones, where anything pressed is at least --control-h-lg.
	it.each([
		['the install offer', offerInstall],
		['the iOS hint', beIosSafari]
	])('gives every button in %s a 40px touch target', async (_, arrange) => {
		arrange();
		render(InstallPrompt, { appName: 'Acme' });
		await expect.element(page.getByRole('button').first()).toBeVisible();
		for (const button of page.getByRole('button').elements()) {
			const { height } = button.getBoundingClientRect();
			expect(height, `“${button.textContent}” button height in px`).toBeGreaterThanOrEqual(40);
		}
	});
});
