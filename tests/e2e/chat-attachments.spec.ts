// Files in the chat box sit in a strip above the text, outside it: typing never replaces one,
// each can be taken out alone, and paste and drop land there. And the quiet "Replying to" line
// says "you" and "yourself" as Campsite's does. Against the built Worker (serve.ts).
import { expect, test, type Browser, type Page } from '@playwright/test';
import { chat } from '../../src/lib/strings/chat.ts';
import { baseURL, people, threads, type Person } from './fixtures.ts';

// Each test leaves messages for the next, so they run in order.
test.describe.configure({ mode: 'serial' });

const s = chat.thread;
const thread = `/chat/${threads.cy.id}`;
const messages = (page: Page) => page.locator('[id^="message-"]');
const strip = (page: Page) => page.locator('[data-attachment-strip]');
const box = (page: Page) => page.locator('.ProseMirror');

// A 1x1 PNG.
const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);
const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png });

async function open(browser: Browser, who: Person = 'ada') {
	const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(thread, { waitUntil: 'networkidle' });
	return page;
}

const attach = (page: Page, ...names: string[]) =>
	page.locator('input[type=file]').last().setInputFiles(names.map(file));

test('typing after clicking into the middle of the text leaves the picture in the strip', async ({
	browser
}) => {
	const page = await open(browser);
	await attach(page, 'lake.png');
	await expect(strip(page).locator('img')).toHaveCount(1);
	await expect(box(page).locator('img')).toHaveCount(0);

	await box(page).click();
	await page.keyboard.type('Packed the stove');
	await box(page).click({ position: { x: 60, y: 10 } });
	await page.keyboard.type('!');
	await expect(strip(page).locator('img')).toHaveCount(1);
	await expect(box(page)).toContainText('!');

	await page.getByRole('button', { name: s.send, exact: true }).click();
	const sent = messages(page).filter({ hasText: 'Packed' });
	await expect(sent).toHaveCount(1);
	await expect(sent.locator('img[alt="lake.png"]')).toHaveCount(1);
	await expect(strip(page).locator('img')).toHaveCount(0);
	await page.context().close();
});

test('the remove button takes out one file, and the rest send', async ({ browser }) => {
	const page = await open(browser);
	await attach(page, 'one.png', 'two.png');
	await expect(strip(page).locator('img')).toHaveCount(2);

	await strip(page).locator('li').first().getByRole('button', { name: s.removeAttachment }).click();
	await expect(strip(page).locator('img')).toHaveCount(1);

	// Files alone are enough to send.
	await page.getByRole('button', { name: s.send, exact: true }).click();
	const sent = messages(page).locator('img[alt="two.png"]');
	await expect(sent).toHaveCount(1);
	await expect(messages(page).locator('img[alt="one.png"]')).toHaveCount(0);
	await page.context().close();
});

test('a picture pasted or dropped on the box goes to the strip, not the text', async ({
	browser
}) => {
	const page = await open(browser);
	const bytes = [...png];
	for (const [kind, name] of [
		['paste', 'pasted.png'],
		['drop', 'dropped.png']
	] as const) {
		await box(page).evaluate(
			(element, { kind, name, bytes }) => {
				const data = new DataTransfer();
				data.items.add(new File([new Uint8Array(bytes)], name, { type: 'image/png' }));
				const { x, y } = element.getBoundingClientRect();
				const init = { dataTransfer: data, clientX: x + 10, clientY: y + 10, bubbles: true };
				element.dispatchEvent(
					kind === 'paste'
						? new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
						: new DragEvent('drop', { ...init, cancelable: true })
				);
			},
			{ kind, name, bytes }
		);
	}
	await expect(strip(page).locator('img')).toHaveCount(2);
	await expect(box(page).locator('img')).toHaveCount(0);
	await page.context().close();
});

test('a reply says "you" to the one answered, "yourself" to a self-reply, and a name to others', async ({
	browser
}) => {
	const ada = await open(browser);
	const reply = async (page: Page, quoted: string, text: string) => {
		const message = messages(page).filter({ hasText: quoted }).last();
		await message.hover();
		await message.getByRole('button', { name: s.reply }).click();
		await box(page).click();
		await page.keyboard.type(text);
		await page.keyboard.press('Enter');
		await expect(messages(page).filter({ hasText: text })).toHaveCount(1);
	};

	// Ada answers Cy's message: Ada sees Cy's name.
	await reply(ada, threads.cy.text, 'On my list');
	await expect(
		messages(ada).filter({ hasText: 'On my list' }).first().getByText(s.replyingTo('Cy'))
	).toBeVisible();

	// The bar above the box says whose message is being answered.
	const own = messages(ada).filter({ hasText: 'On my list' }).first();
	await own.hover();
	await own.getByRole('button', { name: s.reply }).click();
	await expect(ada.locator('.replying')).toHaveText(new RegExp(s.replyingToYourMessage));

	// Ada answers her own: "yourself".
	await box(ada).click();
	await ada.keyboard.type('And the lanterns');
	await ada.keyboard.press('Enter');
	await expect(
		messages(ada).filter({ hasText: 'And the lanterns' }).getByText(s.replyingToYourself)
	).toBeVisible();

	// Cy sees Ada's answer to Cy's own message as "you", and the self-reply under Ada's name.
	const cy = await open(browser, 'cy');
	await expect(
		messages(cy).filter({ hasText: 'On my list' }).first().getByText(s.replyingToYou)
	).toBeVisible();
	await expect(
		messages(cy).filter({ hasText: 'And the lanterns' }).getByText(s.replyingTo('Ada'))
	).toBeVisible();
	await ada.context().close();
	await cy.context().close();
});
