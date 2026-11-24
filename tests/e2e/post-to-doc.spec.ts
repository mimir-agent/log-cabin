// A post page's “…” menu holds Make a doc from this thread for every reader: it copies the
// title and body into a new doc that is the reader's alone, with no comments, and opens it with the
// caret at the end of the body. The post stays as it was. The doc's timeline opens with a line that
// links back. A thread in a channel the person isn't in is not found. On a 390 × 844 touch screen and
// a 1280 × 800 window.
import { expect, test, type Browser, type BrowserContextOptions } from '@playwright/test';
import { baseURL, cave, people, post } from './fixtures.ts';

const profiles: Record<string, BrowserContextOptions> = {
	phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
	desktop: { viewport: { width: 1280, height: 800 } }
};

async function signIn(browser: Browser, use: BrowserContextOptions, who: keyof typeof people) {
	const context = await browser.newContext({ ...use, baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	return context;
}

for (const [size, use] of Object.entries(profiles)) {
	test.describe(size, () => {
		test('a reader who isn’t the author makes a private doc from the thread', async ({
			browser
		}) => {
			const ada = await (await signIn(browser, use, 'ada')).newPage();
			await ada.goto(`/posts/${post.id}`, { waitUntil: 'networkidle' });
			await ada
				.locator('header.page-header:visible')
				.getByRole('button', { name: 'More actions' })
				.click();
			await ada.getByRole('menuitem', { name: 'Make a doc from this thread' }).click();

			await ada.waitForURL(/\/notes\/[0-9A-Z]{26}/);
			const noteId = new URL(ada.url()).pathname.split('/').pop()!;
			await expect(ada.getByRole('textbox', { name: 'Title' })).toHaveValue(post.title);
			const body = ada.getByRole('textbox', { name: /^Write something/ });
			await expect(body).toContainText(post.text);
			await expect(ada.getByText(post.comment.text)).toHaveCount(0);
			const line = ada.locator('p.line');
			await expect(line).toContainText('Ada made this doc from');
			await expect(line.getByRole('link', { name: post.title })).toHaveAttribute(
				'href',
				`/posts/${post.id}`
			);

			await expect(body).toBeFocused();
			await ada.keyboard.type('!');
			await expect(body.locator('p').last()).toHaveText(`${post.text}!`);

			const bo = await (await signIn(browser, use, 'bo')).newPage();
			const response = await bo.goto(`/notes/${noteId}`);
			expect(
				response?.status(),
				'a doc nobody shared is private, even from the post’s author'
			).toBe(404);

			await ada.goto(`/posts/${post.id}`, { waitUntil: 'networkidle' });
			await expect(ada.getByText(post.comment.text)).toBeVisible();
			await expect(
				ada.getByRole('article').getByRole('heading', { name: post.title })
			).toBeVisible();
		});
	});
}

test('the author keeps the menu’s own actions beside the new ones', async ({ browser }) => {
	const bo = await (await signIn(browser, profiles.desktop, 'bo')).newPage();
	await bo.goto(`/posts/${post.id}`, { waitUntil: 'networkidle' });
	await bo
		.locator('header.page-header:visible')
		.getByRole('button', { name: 'More actions' })
		.click();
	for (const name of ['Make a doc from this thread', 'Copy link', 'Edit', 'Delete']) {
		await expect(bo.getByRole('menuitem', { name })).toBeVisible();
	}
});

test('a thread in a channel the person isn’t in is not found', async ({ browser }) => {
	const context = await signIn(browser, profiles.desktop, 'cy');
	const response = await context.request.post(`/posts/${cave.post.id}?/makeDoc`, {
		headers: { accept: 'text/html', origin: baseURL },
		form: {}
	});
	expect(response.status()).toBe(404);
});
