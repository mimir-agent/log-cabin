// Opening a page reads what the inbox holds about it, and its header can mark that done. Cy
// has two notifications about Bo's post, under two items (a comment and a reaction), added
// here so no other spec's unread counts change.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, people, post } from './fixtures.ts';
import { d1 } from './database.ts';

const probe = 'Open-reads probe';

test.beforeAll(() => {
	const row = (id: string, itemKey: string, url: string) =>
		`('${id}', '${people.cy.id}', '${people.bo.id}', 'comment', '${itemKey}', '${url}', '${probe}', 'e2e:${id}', ${Date.now()})`;
	const sql = `INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, title, source, created_at) VALUES
		${row('01E2EOPEN0000000000000001', `post:${post.id}`, `/posts/${post.id}#comment-x`)},
		${row('01E2EOPEN0000000000000002', `reactions:post:${post.id}`, `/posts/${post.id}`)};`;
	d1(sql);
});

async function signInAsCy(browser: Browser) {
	const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
	await context.addCookies([{ name: 'campfire_session', value: people.cy.token, url: baseURL }]);
	return context.newPage();
}

/** Whether the inbox's tab lists the probe notification. */
async function inTab(page: Page, tab: 'unread' | 'read' | 'archived') {
	await page.goto(`/inbox?tab=${tab}`, { waitUntil: 'networkidle' });
	return page
		.getByRole('list')
		.getByText(probe)
		.count()
		.then((count) => count > 0);
}

test('opening the post reads every notification about it, and Mark done archives them', async ({
	browser
}) => {
	const page = await signInAsCy(browser);
	expect(await inTab(page, 'unread'), 'both are unread to begin with').toBe(true);

	await page.goto(`/posts/${post.id}`, { waitUntil: 'networkidle' });
	const done = page.getByRole('button', { name: 'Mark done' });
	await expect(done, 'the inbox still holds them, read now').toBeVisible();
	await expect.poll(() => inTab(page, 'unread')).toBe(false);
	expect(await inTab(page, 'read')).toBe(true);

	await page.goto(`/posts/${post.id}`, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Mark done' }).click();
	await expect(page.getByRole('button', { name: 'Mark done' })).toHaveCount(0);
	expect(await inTab(page, 'read')).toBe(false);
	expect(await inTab(page, 'archived')).toBe(true);
	await page.context().close();
});
