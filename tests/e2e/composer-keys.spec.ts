// The keys that send in chat, comments and new posts, and the send button of each box with a
// picture in it on a phone. Against the built Worker (serve.ts).
import { crc32, deflateSync } from 'node:zlib';
import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, people, posts, project, threads } from './fixtures.ts';

// Each test leaves messages for the next, so they run in order.
test.describe.configure({ mode: 'serial' });

const chat = `/chat/${threads.cy.id}`;
const messages = (page: Page) => page.locator('[id^="message-"]');

async function open(browser: Browser, path: string, device?: keyof typeof devices) {
	const context = await browser.newContext({
		baseURL,
		...(device ? devices[device] : { viewport: { width: 1280, height: 800 } })
	});
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(path, { waitUntil: 'networkidle' });
	return page;
}

/** A grey PNG of this size, for a camera's picture. */
function png(width: number, height: number): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type), data]);
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, crc]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 2, 0, 0, 0], 8);
	const row = Buffer.alloc(1 + width * 3, 120);
	row[0] = 0; // filter type: none
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
		chunk('IEND', Buffer.alloc(0))
	]);
}

test('in chat, Enter sends, Shift+Enter starts a new line, and Ctrl+Enter sends too', async ({
	browser
}) => {
	const page = await open(browser, chat);
	const box = page.locator('.ProseMirror');
	await box.click();
	await page.keyboard.type('Bring');
	await page.keyboard.press('Shift+Enter');
	await page.keyboard.type('the kettle');
	await expect(messages(page).filter({ hasText: 'the kettle' })).toHaveCount(0);
	await page.keyboard.press('Enter');
	const sent = messages(page).filter({ hasText: 'the kettle' });
	await expect(sent).toHaveCount(1);
	expect(await sent.innerText()).toMatch(/Bring\s*\n\s*the kettle/);
	await expect(box).toHaveText('');

	await page.keyboard.type('And the lanterns');
	await page.keyboard.press('Control+Enter');
	await expect(messages(page).filter({ hasText: 'And the lanterns' })).toHaveCount(1);
	await expect(box).toHaveText('');
	await page.context().close();
});

test('on a touch screen Enter is a new line in chat, and the button sends', async ({ browser }) => {
	const page = await open(browser, chat, 'iPhone 13');
	await page.locator('.ProseMirror').click();
	await page.keyboard.type('Two lines');
	await page.keyboard.press('Enter');
	await page.keyboard.type('on a phone');
	await expect(page.locator('.ProseMirror p')).toHaveCount(2);
	await expect(messages(page).filter({ hasText: 'on a phone' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Send' }).click();
	await expect(messages(page).filter({ hasText: 'on a phone' })).toHaveCount(1);
	await page.context().close();
});

test('Ctrl+Enter sends a comment without a line break at its end', async ({ browser }) => {
	const page = await open(browser, `/posts/${posts.packing.id}`);
	const sent = page.waitForRequest((request) => request.url().includes('?/comment'));
	await page.locator('.ProseMirror').last().click();
	await page.keyboard.type('Packed the stove');
	await page.keyboard.press('Control+Enter');
	expect((await sent).postData()).not.toContain('hardBreak');
	await expect(page.getByText('Packed the stove')).toBeVisible();
	await page.context().close();
});

test('Ctrl+Enter publishes a new post', async ({ browser }) => {
	const page = await open(browser, `/projects/${project.id}/new`);
	await page.getByRole('textbox', { name: 'Title' }).fill('Camp stove');
	await page.locator('.ProseMirror').click();
	await page.keyboard.type('Who has one?');
	await page.keyboard.press('Control+Enter');
	await expect(page).toHaveURL(`/projects/${project.id}`);
	await expect(page.getByText('Camp stove').first()).toBeVisible();
	await page.context().close();
});

for (const [name, path, send, picture] of [
	['chat', chat, 'Send', '[data-attachment-strip] img'],
	['comment', `/posts/${posts.packing.id}`, 'Comment', '.ProseMirror img']
] as const) {
	test(`on a phone the ${name} box keeps its send button in view and on top with a picture in it`, async ({
		browser
	}) => {
		const page = await open(browser, path, 'iPhone 13');
		await page
			.locator('input[type=file]')
			.last()
			.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png(4000, 3000) });
		await expect(page.locator(picture)).toBeVisible();
		const button = page.getByRole('button', { name: send, exact: true });
		await expect(button).toBeEnabled();
		await button.scrollIntoViewIfNeeded();
		const box = (await button.boundingBox())!;
		const viewport = page.viewportSize()!;
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
		expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
		const onTop = await button.evaluate((element) => {
			const { x, y, width, height } = element.getBoundingClientRect();
			return element.contains(document.elementFromPoint(x + width / 2, y + height / 2));
		});
		expect(onTop).toBe(true);
		await page.context().close();
	});
}
