// A time inserted into a note shows as a chip on each reader's own clock, with the time it was
// written in on hover, and it survives a reload.
import { devices, expect, test, webkit, type Browser, type Page } from '@playwright/test';
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

/** Picks `value` in the chip's date and time field, as a person does once the picker is open. */
async function pick(page: Page, index: number, value: string) {
	const field = chips(page).nth(index).getByLabel('When');
	await expect(field).toBeFocused();
	await field.fill(value);
}

test('clicking a time, or pressing Enter on it once selected, opens its picker, and the time picked shows on a reader in Tokyo', async ({
	browser
}) => {
	const ada = await open(browser, 'ada', liveContext.timezoneId);
	await expect(chips(ada)).toHaveCount(2);
	await chips(ada).nth(1).click();
	await pick(ada, 1, '2030-03-04T15:45');
	await expect(chips(ada).nth(1)).toHaveText('Mon, Mar 4, 3:45 PM');
	await expect(chips(ada).first(), 'the other time is as it was').toHaveText('Wed, Jan 2, 9:30 AM');

	// Enter on a selected time: the caret is put after it, then ArrowLeft past the space and onto it.
	await body(ada)
		.locator('p')
		.first()
		.click({ position: { x: 2, y: 5 } });
	await ada.keyboard.press('End');
	await caretTaken(body(ada));
	await ada.keyboard.press('ArrowLeft');
	await caretTaken(body(ada));
	await ada.keyboard.press('ArrowLeft');
	await expect(chips(ada).nth(1)).toHaveClass(/ProseMirror-selectednode/);
	await ada.keyboard.press('Enter');
	await pick(ada, 1, '2030-03-04T16:15');
	await expect(chips(ada).nth(1)).toHaveText('Mon, Mar 4, 4:15 PM');
	await expect(body(ada).locator('p'), 'Enter did not split the paragraph').toHaveCount(1);

	await ada.reload();
	await expect(chips(ada).nth(1)).toHaveText('Mon, Mar 4, 4:15 PM');
	await ada.context().close();

	const bo = await open(browser, 'bo', 'Asia/Tokyo');
	await expect(chips(bo).nth(1)).toHaveText('Tue, Mar 5, 1:15 AM');
	await bo.context().close();
});

test('on an iPhone, tapping a time opens its picker and the time picked is kept', async () => {
	const phone = await webkit.launch();
	const context = await phone.newContext({
		...devices['iPhone 13'],
		baseURL,
		timezoneId: liveContext.timezoneId
	});
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/notes/${camp.id}`);
	await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

	const field = chips(page).nth(1).getByLabel('When');
	const box = (await field.boundingBox())!;
	expect(box.width, 'a tap target at least 44px wide').toBeGreaterThanOrEqual(44);
	expect(box.height, 'a tap target at least 44px tall').toBeGreaterThanOrEqual(44);

	await chips(page).nth(1).tap();
	await pick(page, 1, '2030-05-06T11:15');
	await expect(chips(page).nth(1)).toHaveText('Mon, May 6, 11:15 AM');

	await page.reload();
	await expect(chips(page).nth(1)).toHaveText('Mon, May 6, 11:15 AM');
	await phone.close();
});
