// The thread list beside an open thread: a thread you have opened stops showing as unread.
import { expect, test, type Browser } from '@playwright/test';
import { baseURL, people, threads } from './fixtures.ts';

async function signIn(browser: Browser, viewport: { width: number; height: number }) {
	const context = await browser.newContext({ baseURL, viewport });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	return context.newPage();
}

const row = (id: string) => `a[href="/chat/${id}"]`;
// The open thread's row never shows a dot, so each test waits for its row to stop being
// the open one before it looks for the dot.

test('on a wide screen, a thread opened and left is read', async ({ browser }) => {
	const page = await signIn(browser, { width: 1280, height: 800 });
	await page.goto('/chat');
	await expect(page.locator(row(threads.bo.id))).toHaveAttribute('data-unread');
	await page.locator(row(threads.bo.id)).click();
	await expect(page).toHaveURL(`/chat/${threads.bo.id}`);
	await expect(page.getByRole('heading', { name: people.bo.name, exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'New DM' }).click();
	await expect(page).toHaveURL(/\/chat\/new$/);
	await expect(page.locator(row(threads.bo.id))).not.toHaveAttribute('aria-current');
	await expect(page.locator(row(threads.bo.id))).not.toHaveAttribute('data-unread');
	await page.context().close();
});

test('hovering a thread in the list previews it and leaves it unread', async ({ browser }) => {
	const page = await signIn(browser, { width: 1280, height: 800 });
	await page.goto(`/chat/${threads.bo.id}`);
	await expect(page.locator(row(threads.cy.id))).toHaveAttribute('data-unread');
	await page.locator(row(threads.cy.id)).hover();
	await expect(page.locator('.hover-card')).toContainText(threads.cy.text);
	await page.reload();
	await expect(page.locator(row(threads.cy.id))).toHaveAttribute('data-unread');
	await page.context().close();
});

test('on a phone, going back from a thread shows it read', async ({ browser }) => {
	const page = await signIn(browser, { width: 390, height: 844 });
	await page.goto('/chat');
	await expect(page.locator(row(threads.cy.id))).toHaveAttribute('data-unread');
	await page.locator(row(threads.cy.id)).click();
	await expect(page).toHaveURL(`/chat/${threads.cy.id}`);
	await expect(page.getByRole('heading', { name: people.cy.name, exact: true })).toBeVisible();
	await page.goBack();
	await expect(page).toHaveURL(/\/chat$/);
	await expect(page.locator(row(threads.cy.id))).not.toHaveAttribute('aria-current');
	await expect(page.locator(row(threads.cy.id))).not.toHaveAttribute('data-unread');
	await page.context().close();
});
