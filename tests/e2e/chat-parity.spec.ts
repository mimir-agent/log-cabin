// A group of 300 messages: paging back 20 at a time, the button for new messages while
// scrolled up, Enter to send, and a rename that others see without reloading.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { chat } from '../../src/lib/strings/chat.ts';
import { baseURL, crew, people, type Person } from './fixtures.ts';

// One test leaves messages and a name for the next, so they run in order.
test.describe.configure({ mode: 'serial' });

async function open(browser: Browser, who: Person) {
	const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/chat/${crew.id}`, { waitUntil: 'networkidle' });
	return page;
}

const bubbles = (page: Page) => page.locator('[id^="message-"]');

/** The numbers in "Message 007" and the like, in the order they are on the page. */
async function numbersShown(page: Page) {
	const texts = await bubbles(page).allInnerTexts();
	return texts.map((text) => Number(/Message (\d{3})/.exec(text)?.[1]));
}

test('earlier messages load 20 at a time as the top comes into view, with none missing or twice', async ({
	browser
}) => {
	const page = await open(browser, 'ada');
	await expect(bubbles(page)).toHaveCount(20);
	expect(await numbersShown(page)).toEqual(
		Array.from({ length: 20 }, (_, i) => crew.messageCount - 19 + i)
	);

	// The first load keeps the reader on the message they were on, instead of leaving them at the top.
	const readerId = await bubbles(page).first().getAttribute('id');
	await page.evaluate(() => scrollTo(0, 0));
	await expect(bubbles(page)).toHaveCount(40);
	await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
	await expect(page.locator(`#${readerId}`)).toBeInViewport();

	// Each time the top is reached, the next 20 arrive, until the first message is there.
	for (let pages = 3; pages <= crew.messageCount / 20; pages++) {
		await page.evaluate(() => scrollTo(0, 0));
		await expect(bubbles(page)).toHaveCount(pages * 20);
	}
	expect(await numbersShown(page)).toEqual(
		Array.from({ length: crew.messageCount }, (_, i) => i + 1)
	);
	await page.context().close();
});

test('scrolled up, a message that arrives shows as a button that takes you to it', async ({
	browser
}) => {
	const ada = await open(browser, 'ada');
	// A few pages up, well out of reach of the end.
	for (let pages = 2; pages <= 4; pages++) {
		await ada.evaluate(() => scrollTo(0, 0));
		await expect(bubbles(ada)).toHaveCount(pages * 20);
	}
	await ada.evaluate(() => scrollTo(0, 0));
	const bo = await open(browser, 'bo');
	await bo.locator('.ProseMirror').click();
	await bo.keyboard.type('Anyone there?');
	await bo.keyboard.press('Enter');

	const jump = ada.getByRole('button', { name: chat.thread.newMessages });
	await expect(jump).toBeVisible();
	await jump.click();
	await expect(bubbles(ada).filter({ hasText: 'Anyone there?' })).toBeInViewport();
	await expect(jump).toBeHidden();
	await ada.context().close();
	await bo.context().close();
});

test('Enter sends, Shift+Enter starts a new line, and the box is empty after', async ({
	browser
}) => {
	const page = await open(browser, 'ada');
	const box = page.locator('.ProseMirror');
	await box.click();
	await page.keyboard.type('Bring');
	await page.keyboard.press('Shift+Enter');
	await page.keyboard.type('the maps');
	await expect(bubbles(page).filter({ hasText: 'the maps' })).toHaveCount(0);
	await page.keyboard.press('Enter');

	const sent = bubbles(page).filter({ hasText: 'the maps' });
	await expect(sent).toHaveCount(1);
	expect(await sent.innerText()).toMatch(/Bring\s*\n\s*the maps/);
	await expect(box).toHaveText('');
	await page.reload({ waitUntil: 'networkidle' });
	await expect(bubbles(page).filter({ hasText: 'the maps' })).toHaveCount(1);
	await page.context().close();
});

test('renaming the group shows for the others at once, and clearing the name goes back to the members’ names', async ({
	browser
}) => {
	const ada = await open(browser, 'ada');
	const bo = await open(browser, 'bo');
	await expect(bo.getByRole('heading', { name: crew.title, exact: true })).toBeVisible();

	await ada.getByRole('button', { name: chat.menu.label }).click();
	await ada.getByRole('menuitem', { name: chat.menu.edit }).click();
	await ada.getByLabel(chat.editGroup.name).fill('Trailblazers');
	await ada.getByRole('button', { name: chat.editGroup.save }).click();

	await expect(bo.getByRole('heading', { name: 'Trailblazers', exact: true })).toBeVisible();
	await expect(bo.locator(`a[href="/chat/${crew.id}"]`)).toContainText('Trailblazers');

	await ada.getByRole('button', { name: chat.menu.label }).click();
	await ada.getByRole('menuitem', { name: chat.menu.edit }).click();
	await ada.getByLabel(chat.editGroup.name).fill('');
	await ada.getByRole('button', { name: chat.editGroup.save }).click();

	await expect(bo.getByRole('heading', { name: 'Ada and Cy', exact: true })).toBeVisible();
	await ada.context().close();
	await bo.context().close();
});
