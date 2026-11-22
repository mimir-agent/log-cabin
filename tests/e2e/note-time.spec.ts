// A time inserted into a note shows as a chip on each reader's own clock, with the time it was
// written in on hover, and it survives a reload.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, notes, people, type Person } from './fixtures.ts';
import { caretTaken, liveContext } from './editor.ts';

const camp = notes.camp;
const body = (page: Page) => page.getByRole('textbox', { name: /^Write something/ });
const chips = (page: Page) => body(page).locator('time');

async function open(browser: Browser, who: Person, timezoneId: string) {
	const context = await browser.newContext({ baseURL, timezoneId });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/notes/${camp.id}`);
	await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
	return page;
}

test('a time inserted from the toolbar and from /time shows as a chip, and a reader in Tokyo sees it as Tokyo time', async ({
	browser
}) => {
	// UTC is the zone the server writes in until a browser names another, so the live editor
	// isn't rebuilt by a first-visit reload while Ada types.
	const ada = await open(browser, 'ada', liveContext.timezoneId);
	await body(ada).locator('p').first().click();
	await ada.keyboard.press('End');
	await caretTaken(body(ada));
	await ada.getByRole('button', { name: 'Date and time' }).click();
	await ada.getByLabel('When').fill('2030-01-02T09:30');
	await ada.getByRole('button', { name: 'Insert' }).click();
	await expect(chips(ada)).toHaveText('Wed, Jan 2, 9:30 AM');

	await ada.keyboard.type('/time');
	await ada.keyboard.press('Enter');
	await expect(chips(ada)).toHaveCount(2);

	await ada.reload();
	await expect(chips(ada).first()).toHaveText('Wed, Jan 2, 9:30 AM');
	await expect(chips(ada).first()).toHaveAttribute('title', /9:30 AM UTC$/);
	await ada.context().close();

	const bo = await open(browser, 'bo', 'Asia/Tokyo');
	await expect(chips(bo)).toHaveCount(2);
	await expect(chips(bo).first()).toHaveText('Wed, Jan 2, 6:30 PM');
	await expect(chips(bo).first(), 'hover shows the time where it was written').toHaveAttribute(
		'title',
		/9:30 AM UTC$/
	);
	await bo.context().close();
});
