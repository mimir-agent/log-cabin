// Files in a live note, end to end: an editor attaches an image and the other editor's page
// shows it, served to both; a reader who can only view gets no attach button.
// `pnpm test:e2e` builds, starts the server (serve.ts) and runs this file.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, notes, people, type Person } from './fixtures.ts';

const trip = notes.trip;

/** A 1×1 PNG, small enough to upload anywhere. */
const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64'
);

/** Signs in as `who` in a browser context of their own and opens the trip note live. */
async function open(browser: Browser, who: Person): Promise<Page> {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/notes/${trip.id}`);
	await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
	return page;
}

/** The note's body: the live editor (the comment box below is another). */
const body = (page: Page) => page.getByRole('textbox', { name: /^Write something/ });

test('an image an editor attaches to a note shows on the other editor’s page', async ({
	browser
}) => {
	const ada = await open(browser, 'ada');
	const bo = await open(browser, 'bo');
	await body(ada).locator('p').first().click();
	// The attach button opens this input; setting its files is what choosing them does.
	await ada
		.locator('.body input[type="file"]')
		.setInputFiles({ name: 'campsite.png', mimeType: 'image/png', buffer: png });

	const image = body(bo).locator('img[src^="/files/attachments/"]');
	await expect(image).toHaveAttribute('alt', 'campsite.png');
	// Served to Bo, who may edit the note: the image loads rather than breaking.
	await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

	await ada.context().close();
	await bo.context().close();
});

test('someone who can only view the note has nothing to attach with', async ({ browser }) => {
	const cy = await open(browser, 'cy');
	await expect(cy.getByRole('button', { name: 'Attach files' })).toHaveCount(0);
	await cy.context().close();
});
