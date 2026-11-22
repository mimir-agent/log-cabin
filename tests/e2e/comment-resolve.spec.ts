// Resolving a comment's thread on a post, in the browser: Ada resolves Bo's comment and opens
// it again, the state outlives a reload, and nobody can resolve in a channel that is archived.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, comment, people, posts, yard, type Person } from './fixtures.ts';

async function signIn(browser: Browser, who: Person): Promise<Page> {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	return context.newPage();
}

const thread = (page: Page, text: string) => page.locator('.thread', { hasText: text });

test('a post comment resolves and opens again, and either state outlives a reload', async ({
	browser
}) => {
	const ada = await signIn(browser, 'ada');
	await ada.goto(`/posts/${posts.packing.id}`);

	const resolved = ada.waitForResponse((r) => r.url().includes('?/resolveComment') && r.ok());
	await thread(ada, comment.text).getByRole('button', { name: 'More' }).click();
	await ada.getByRole('menuitem', { name: 'Resolve comment' }).click();
	await resolved;
	await ada.reload();
	const line = ada.getByRole('button', { name: 'Ada resolved this thread' });
	await expect(line).toBeVisible();
	await expect(ada.getByText(comment.text)).toBeHidden();

	await line.click();
	await expect(ada.getByText(comment.text)).toBeVisible();
	const reopened = ada.waitForResponse((r) => r.url().includes('?/unresolveComment') && r.ok());
	await ada.getByRole('button', { name: 'Reopen comment' }).click();
	await reopened;
	await ada.reload();
	await expect(ada.getByText(comment.text)).toBeVisible();
	await expect(ada.getByRole('button', { name: /resolved this thread/ })).toHaveCount(0);
	await ada.context().close();
});

test('a reader who can’t comment is offered no Resolve', async ({ browser }) => {
	// Eve is an admin, so the comment's menu opens for her (Delete); the channel is archived.
	const eve = await signIn(browser, 'eve');
	await eve.goto(`/posts/${yard.post.id}`);
	await thread(eve, yard.post.comment.text).getByRole('button', { name: 'More' }).click();
	await expect(eve.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
	await expect(eve.getByRole('menuitem', { name: 'Resolve comment' })).toHaveCount(0);
	await eve.context().close();
});
