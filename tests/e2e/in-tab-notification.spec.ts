// A new notification raises a browser notification in an open tab that is hidden, and not in one
// being looked at. The page's socket and Notification are stood in: the server's side, what
// it publishes and what the push says, is covered by node tests.
import { expect, test, type Page } from '@playwright/test';
import { baseURL, people, post } from './fixtures.ts';

const sent = {
	type: 'new-notification',
	title: 'Bo mentioned you in Plan',
	body: 'Bo mentioned you: Can you look at this?',
	url: `/posts/${post.id}`
};

type Shown = { title: string; body?: string; tag?: string; onclick?: () => void };

/** Opens the app as Ada with `hidden` as the tab's visibility; the socket delivers `sent` on subscribing. */
async function openTab(page: Page, hidden: boolean) {
	await page
		.context()
		.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	await page.addInitScript(
		({ sent, hidden }) => {
			const shown: Shown[] = [];
			Object.assign(window, { shown });
			Object.defineProperty(document, 'visibilityState', {
				get: () => (hidden ? 'hidden' : 'visible')
			});
			class FakeNotification {
				static permission = 'granted';
				onclick?: () => void;
				constructor(title: string, options: { body?: string; tag?: string }) {
					shown.push({ title, ...options, onclick: () => this.onclick?.() });
				}
				close() {}
			}
			Object.assign(window, { Notification: FakeNotification });
			class FakeSocket {
				static OPEN = 1;
				readyState = 0;
				onopen?: (event: unknown) => void;
				onmessage?: (event: { data: string }) => void;
				constructor() {
					setTimeout(() => {
						this.readyState = 1;
						this.onopen?.({});
					}, 0);
				}
				send(raw: string) {
					const { type, topic } = JSON.parse(raw);
					if (type === 'subscribe' && topic.startsWith('user:')) {
						setTimeout(
							() => this.onmessage?.({ data: JSON.stringify({ topic, payload: sent }) }),
							50
						);
					}
				}
				close() {}
			}
			Object.assign(window, { WebSocket: FakeSocket });
		},
		{ sent, hidden }
	);
	await page.goto('/inbox', { waitUntil: 'networkidle' });
}

const shownIn = (page: Page) =>
	page.evaluate(() => (window as unknown as { shown: Shown[] }).shown);

test('a hidden tab shows the notification with Campsite’s title and body, and opens it on a click', async ({
	browser
}) => {
	const context = await browser.newContext({ baseURL });
	const page = await context.newPage();
	await openTab(page, true);
	await expect.poll(() => shownIn(page)).toHaveLength(1);
	expect((await shownIn(page))[0]).toMatchObject({
		title: sent.title,
		body: sent.body,
		tag: sent.url
	});
	await page.evaluate(() => (window as unknown as { shown: Shown[] }).shown[0].onclick?.());
	await expect(page).toHaveURL(sent.url);
	await context.close();
});

test('a tab being looked at shows none', async ({ browser }) => {
	const context = await browser.newContext({ baseURL });
	const page = await context.newPage();
	await openTab(page, false);
	await page.waitForTimeout(500);
	expect(await shownIn(page)).toEqual([]);
	await context.close();
});
