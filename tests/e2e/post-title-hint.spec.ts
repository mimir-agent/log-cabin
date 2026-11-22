// A grey Post says why: with something written and no title it names the missing title; with
// nothing written it stays quiet. Against the built Worker (serve.ts).
import { expect, test } from '@playwright/test';
import { baseURL, people, project } from './fixtures.ts';

test('Post says a title is needed once there is a body without one', async ({ browser }) => {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/projects/${project.id}/new`, { waitUntil: 'networkidle' });
	const post = page.getByRole('button', { name: 'Start thread', exact: true });
	const why = page.getByText('Add a title to start the thread.');

	await expect(post).toBeDisabled();
	await expect(why).toBeHidden();

	await page
		.getByRole('textbox', { name: /^Write something/ })
		.fill('It throws an error without a body');
	await expect(post).toBeDisabled();
	await expect(why).toBeVisible();

	await page.getByRole('textbox', { name: 'Title' }).fill('A title');
	await expect(post).toBeEnabled();
	await expect(why).toBeHidden();
	await context.close();
});
