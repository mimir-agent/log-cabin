// Deleting a post takes its inbox item with it, and an old link to a deleted post or note
// says it was deleted.
import { expect, test, type Browser } from '@playwright/test';
import { baseURL, people, project, type Person } from './fixtures.ts';

async function as(browser: Browser, person: Person) {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([
		{ name: 'campfire_session', value: people[person].token, url: baseURL }
	]);
	return context;
}

const doc = (text: string) =>
	JSON.stringify({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});

/** Submits a form action as a browser would, and returns where it redirected, if it did. */
async function submit(
	context: Awaited<ReturnType<typeof as>>,
	path: string,
	form: Record<string, string>
) {
	const response = await context.request.post(path, {
		form,
		headers: { origin: baseURL, accept: 'text/html' },
		maxRedirects: 0
	});
	expect(response.status(), `${path} answered ${await response.text()}`).toBeLessThan(400);
	return response.headers().location;
}

test('a deleted post leaves the inbox, and its old link says it was deleted', async ({
	browser
}) => {
	const bo = await as(browser, 'bo');
	const ada = await as(browser, 'ada');
	// Once Ada is in Trail, a new post there notifies her.
	await submit(ada, `/projects/${project.id}?/join`, {});
	const postPath = await submit(bo, `/projects/${project.id}/new?/publish`, {
		title: 'Ferry times',
		body: doc('The first ferry leaves at seven.')
	});
	const page = await ada.newPage();
	// After hydration on a wide screen the row's link is /inbox/posts/<id>?tab=unread; before it,
	// the post's own path. data-post is the same in both.
	const item = page.locator(`a[data-post="${postPath.split('/').pop()}"]`);
	// The notification is written by the job queue, a moment after the post.
	await expect(async () => {
		await page.goto('/inbox');
		await expect(item).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 20_000 });

	await submit(bo, `${postPath}?/delete`, {});

	await page.goto('/inbox');
	await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
	await expect(item).toHaveCount(0);
	await page.goto(postPath);
	await expect(page.getByRole('heading', { name: 'This thread was deleted' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible();
	await bo.close();
	await ada.close();
});

test('an old link to a deleted note says it was deleted', async ({ browser }) => {
	const ada = await as(browser, 'ada');
	const notePath = await submit(ada, '/notes/new', { title: 'Scratch', body: doc('Gone soon.') });
	await submit(ada, `${notePath}?/delete`, {});
	const page = await ada.newPage();
	await page.goto(notePath);
	await expect(page.getByRole('heading', { name: 'This doc was deleted' })).toBeVisible();
	await ada.close();
});
