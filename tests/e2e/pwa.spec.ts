// The installed app: Chromium can install it, the service worker shows the offline page when
// the network is down and caches nothing signed in, and push still shows a notification,
// with the app icon's badge kept at the inbox count.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, people } from './fixtures.ts';
import { unreadFixture } from './database.ts';

// The full Chromium, for the push: the headless shell has no push service, so a push sent to
// it never arrives. Install it once with `pnpm exec playwright install chromium`.
test.use({ channel: 'chromium' });

async function signIn(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	return context.newPage();
}

/** Waits until the service worker has installed and controls the page. */
async function waitForServiceWorker(page: Page) {
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

const inboxBadge = (page: Page, count: number) =>
	page.locator('.side').getByText(count === 1 ? '1 unread' : `${count} unread`);

test('Chromium finds the app installable, named for the organization', async ({ browser }) => {
	const page = await signIn(browser);
	await page.goto('/');
	await waitForServiceWorker(page);
	const cdp = await page.context().newCDPSession(page);
	const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
	// Playwright's contexts are incognito, where Chrome never installs anything.
	expect(installabilityErrors.filter(({ errorId }) => errorId !== 'in-incognito')).toEqual([]);
	const manifest = await (await page.request.get('/manifest.webmanifest')).json();
	// serve.ts names the organization Campfire.
	expect(manifest).toMatchObject({ name: 'Campfire', display: 'standalone', start_url: '/' });
	await page.context().close();
});

test('a page load with the network down shows the offline page, and nothing signed in is cached', async ({
	browser
}) => {
	const page = await signIn(browser);
	await page.goto('/');
	await waitForServiceWorker(page);
	await page.context().setOffline(true);
	await page.goto('/inbox');
	await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
	await expect(page.locator('body')).not.toContainText(people.ada.name);
	const cached = await page.evaluate(async () => {
		const paths: string[] = [];
		for (const name of await caches.keys()) {
			for (const request of await (await caches.open(name)).keys()) {
				paths.push(new URL(request.url).pathname);
			}
		}
		return paths;
	});
	expect(cached).toContain('/offline');
	expect(cached.filter((path) => path !== '/offline' && !path.endsWith('.css'))).toEqual([]);

	await page.context().setOffline(false);
	await page.getByRole('link', { name: 'Try again' }).click();
	await expect(page).toHaveURL('/inbox');
	await expect(page.getByRole('heading', { name: 'You’re offline' })).not.toBeVisible();
	await page.context().close();
});

test('the app icon’s badge follows the inbox count, from the page and from a push', async ({
	browser
}) => {
	const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	await context.grantPermissions(['notifications']);
	await context.addInitScript(() => {
		const badges: number[] = [];
		Object.assign(window, { badges });
		navigator.setAppBadge = async (count?: number) => void badges.push(count ?? 0);
	});
	unreadFixture();
	const page = await context.newPage();
	await page.goto('/');
	await waitForServiceWorker(page);

	// The seeded comment on Bo's post is Ada's one unread item.
	await expect(inboxBadge(page, 1)).toBeVisible();
	expect(await page.evaluate(() => (window as unknown as { badges: number[] }).badges.at(-1))).toBe(
		1
	);

	const [worker] = context.serviceWorkers();
	await worker.evaluate(() => {
		const badges: number[] = [];
		Object.assign(self, { badges });
		Object.assign(navigator, { setAppBadge: async (count: number) => void badges.push(count) });
	});
	const cdp = await context.newCDPSession(page);
	const registration = new Promise<string>((resolve) =>
		cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
			if (registrations[0]) resolve(registrations[0].registrationId);
		})
	);
	await cdp.send('ServiceWorker.enable');
	const payload = { title: 'Bo commented', body: 'On Gear list', url: '/inbox', unread: 4 };
	await cdp.send('ServiceWorker.deliverPushMessage', {
		origin: baseURL,
		registrationId: await registration,
		data: JSON.stringify(payload)
	});

	await expect(inboxBadge(page, 4)).toBeVisible();
	expect(await worker.evaluate(() => (self as unknown as { badges: number[] }).badges)).toEqual([
		4
	]);
	const shown = await page.evaluate(async () =>
		(await (await navigator.serviceWorker.ready).getNotifications()).map((n) => n.title)
	);
	expect(shown).toEqual([payload.title]);
	await context.close();
});
