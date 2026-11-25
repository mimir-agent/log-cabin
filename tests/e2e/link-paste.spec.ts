// A pasted link lands once, as a link, in every editor: from plain text alone and from a browser's copy,
// which carries the address as text/plain and as text/html.
import { expect, test, type Locator } from '@playwright/test';
import { baseURL, crew, people, posts, project } from './fixtures.ts';
import { caretTaken, liveContext } from './editor.ts';

const address = 'https://github.com/onyx-dot-app/onyx';

const clipboards = {
	'plain text': { 'text/plain': address },
	'text and HTML': {
		'text/plain': address,
		'text/html': `<meta charset="utf-8"><a href="${address}">${address}</a>`
	}
};

const surfaces = [
	{ name: 'chat composer', url: `/chat/${crew.id}`, box: 'Write a message…' },
	{ name: 'post composer', url: `/projects/${project.id}/new`, box: /^Write something/ },
	{ name: 'comment box', url: `/posts/${posts.packing.id}`, box: 'Write a comment…' }
];

const paste = (box: Locator, data: Record<string, string>) =>
	box.evaluate((element, data) => {
		const clipboardData = new DataTransfer();
		for (const [type, value] of Object.entries(data)) clipboardData.setData(type, value);
		element.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
		);
	}, data);

/** Pastes at the box's first text node: a browser may name the text, not its element, as the target. */
const pasteAtText = (box: Locator, data: Record<string, string>) =>
	box.evaluate((element, data) => {
		const clipboardData = new DataTransfer();
		for (const [type, value] of Object.entries(data)) clipboardData.setData(type, value);
		const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
		text.dispatchEvent(
			new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
		);
	}, data);

for (const surface of surfaces) {
	test.describe(surface.name, () => {
		test.use({ baseURL, ...liveContext });

		test.beforeEach(async ({ context }) => {
			await context.addCookies([
				{ name: 'campfire_session', value: people.ada.token, url: baseURL }
			]);
		});

		for (const [kind, data] of Object.entries(clipboards)) {
			test(`a link pasted as ${kind} is inserted once`, async ({ page }) => {
				await page.goto(surface.url, { waitUntil: 'networkidle' });
				const box = page.getByRole('textbox', { name: surface.box });
				await box.click();
				await caretTaken(box);
				await paste(box, data);
				await expect(box).toHaveText(address);
				await expect(box.locator(`a[href="${address}"]`)).toHaveText(address);
			});
		}
	});
}

test.describe('chat thread', () => {
	test.use({ baseURL, ...liveContext });

	test('a link pasted at the message text is inserted once, not again by the page', async ({
		page,
		context
	}) => {
		await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
		await page.goto(`/chat/${crew.id}`, { waitUntil: 'networkidle' });
		const box = page.getByRole('textbox', { name: 'Write a message…' });
		await box.click();
		await page.keyboard.type('see ');
		await caretTaken(box);
		await pasteAtText(box, clipboards['text and HTML']);
		await expect(box).toHaveText(`see ${address}`);
	});
});
