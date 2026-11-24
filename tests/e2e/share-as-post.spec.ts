// A doc's Share popover opens with “Share in a thread…”: it opens the new-post dialog with a link to
// the doc in the body, posts nothing until Start thread is pressed, and then the doc's timeline says who
// posted it where and a follower of the channel hears of the post. Putting the doc in a channel
// alone adds no post and tells nobody. On a 390 × 844 touch screen and a 1280 × 800 window.
// Bo follows Trail; Ada shares. Each size has its own docs, so a doc is never already in a channel.
import { expect, test, type Browser, type BrowserContextOptions } from '@playwright/test';
import { d1 } from './database.ts';
import { baseURL, people, project, snow } from './fixtures.ts';

const profiles: Record<string, BrowserContextOptions> = {
	phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
	desktop: { viewport: { width: 1280, height: 800 } }
};

/** A doc of Ada's in no channel, one per size and purpose. */
const doc = (size: string, purpose: 'alone' | 'post') => ({
	id: `01E2ESHAREP0ST${size === 'phone' ? 'P' : 'D'}${purpose === 'alone' ? 'A' : 'B'}`.padEnd(
		26,
		'0'
	),
	title: `Outing ${size} ${purpose}`
});

test.beforeAll(() => {
	const now = Date.now();
	const body = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
	const rows = Object.keys(profiles).flatMap((size) =>
		(['alone', 'post'] as const).map((purpose) => {
			const { id, title } = doc(size, purpose);
			return `('${id}', '${people.ada.id}', '${title}', '${body}', '', ${now}, ${now}, '${people.ada.id}')`;
		})
	);
	d1(
		`INSERT INTO project_subscriptions (project_id, user_id, created_at) VALUES ('${project.id}', '${people.bo.id}', ${now}) ON CONFLICT DO NOTHING;
		INSERT OR IGNORE INTO notes (id, author_id, title, body, body_text, created_at, updated_at, updated_by) VALUES ${rows.join(', ')};`
	);
});

async function signIn(browser: Browser, use: BrowserContextOptions, who: 'ada' | 'bo') {
	const context = await browser.newContext({ ...use, baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	return context.newPage();
}

async function openShare(browser: Browser, use: BrowserContextOptions, noteId: string) {
	const page = await signIn(browser, use, 'ada');
	await page.goto(`/notes/${noteId}`, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	return page;
}

for (const [size, use] of Object.entries(profiles)) {
	test.describe(size, () => {
		test('putting a doc in a channel alone adds no post and tells no follower', async ({
			browser
		}) => {
			const { id, title } = doc(size, 'alone');
			const page = await openShare(browser, use, id);
			await page.getByRole('combobox', { name: 'Channel' }).selectOption({ label: project.name });
			await page.getByRole('button', { name: 'Save', exact: true }).click();
			await expect(page.getByRole('combobox', { name: 'Channel' })).toHaveValue(project.id);

			await page.goto(`/projects/${project.id}`);
			await expect(page.getByRole('link', { name: title })).toHaveCount(0);
			const bo = await signIn(browser, use, 'bo');
			await bo.goto('/inbox');
			await expect(bo.getByText(title)).toHaveCount(0);
		});

		test('the first row opens the dialog with the doc, and posting tells a follower and marks the doc', async ({
			browser
		}) => {
			const { id, title } = doc(size, 'post');
			const subject = `Outing plan ${size}`;
			const page = await openShare(browser, use, id);
			const share = page.getByRole('button', { name: 'Share in a thread…' });
			await expect(share).toBeVisible();
			const sharing = page.getByRole('heading', { name: 'Sharing', exact: true });
			expect((await share.boundingBox())!.y, 'the row sits above the Sharing section').toBeLessThan(
				(await sharing.boundingBox())!.y
			);

			await share.click();
			const dialog = page.getByRole('dialog');
			await expect(dialog.getByRole('link', { name: title })).toHaveAttribute(
				'href',
				`${baseURL}/notes/${id}`
			);
			await expect(page.getByRole('button', { name: 'Share in a thread…' })).toHaveCount(0);
			await expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveValue('');
			await expect(
				dialog.getByText('Posting adds this doc to the channel. People there can view it.')
			).toBeVisible();

			// A doc in no channel opens the channel list; the person picks one.
			await page.locator('button.item', { hasText: project.name }).click();
			await dialog.getByRole('textbox', { name: 'Title' }).fill(subject);
			await dialog.getByRole('button', { name: 'Start thread', exact: true }).click();
			await expect(dialog, 'the dialog closes and the person stays on the doc').toBeHidden();
			await expect(page).toHaveURL(`${baseURL}/notes/${id}`);

			await page.goto(`/notes/${id}`, { waitUntil: 'networkidle' });
			const lines = page.locator('p.line', { hasText: 'shared this doc in' });
			await expect(lines).toHaveCount(1);
			await expect(lines).toContainText(`Ada shared this doc in ${project.name}`);

			const bo = await signIn(browser, use, 'bo');
			// The queue delivers the notice a moment after the post; its preview is the doc's link.
			await expect(async () => {
				await bo.goto('/inbox', { waitUntil: 'networkidle' });
				await expect(bo.getByText(title).first()).toBeVisible({ timeout: 1000 });
			}).toPass({ timeout: 30_000 });
		});

		test('a doc already in the channel opens the dialog on it with the title focused', async ({
			browser
		}) => {
			const page = await openShare(browser, use, snow.note.id);
			await page.getByRole('button', { name: 'Share in a thread…' }).click();
			const dialog = page.getByRole('dialog');
			await expect(dialog.getByRole('link', { name: snow.note.title })).toBeVisible();
			await expect(dialog.getByRole('button', { name: project.name })).toBeVisible();
			await expect(dialog.getByRole('textbox', { name: 'Title' })).toBeFocused();
			await expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveValue('');
			await expect(dialog.getByText('Posting adds this doc')).toHaveCount(0);
		});
	});
}
