// The note titlebar's Share button keeps its name on a phone, where its label is hidden and
// only the paper airplane shows, as well as on a desktop. Bo may edit the trip note, so he may
// share it; Cy may only view it, so she has no Share button at all.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { baseURL, notes, people, type Person } from './fixtures.ts';

const viewports = {
	phone: { width: 390, height: 844 },
	desktop: { width: 1280, height: 800 }
};

/** Opens the trip note as `who`, waiting for the titlebar's comments link. */
async function open(context: BrowserContext, page: Page, who: Person) {
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	await page.goto(`/notes/${notes.trip.id}`);
	await expect(page.getByRole('link', { name: 'Comments' })).toBeVisible();
}

for (const [name, viewport] of Object.entries(viewports)) {
	test.describe(name, () => {
		test.use({ viewport });

		test('someone who may edit the note finds Share by name', async ({ context, page }) => {
			await open(context, page, 'bo');
			const share = page.getByRole('button', { name: 'Share', exact: true });
			await expect(share).toBeVisible();
			await expect(share).toBeEnabled();
		});

		test('someone who may only view the note has no Share button', async ({ context, page }) => {
			await open(context, page, 'cy');
			await expect(page.getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
		});
	});
}
