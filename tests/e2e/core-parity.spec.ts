// The core surfaces as Campsite has them: the inbox's side pane, a reply box in every comment
// thread, and New post as a dialog over the page. Against the built Worker (serve.ts).
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, camp, comment, people, post, posts, project, type Person } from './fixtures.ts';
import { unreadFixture } from './database.ts';

const desktop = { width: 1280, height: 800 };
const phone = { width: 390, height: 844 };

async function signIn(browser: Browser, who: Person, viewport = desktop): Promise<Page> {
	const context = await browser.newContext({ baseURL, viewport });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	return context.newPage();
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(unreadFixture);

test('from 1024px an inbox row opens its post beside the list, by click or by keys', async ({
	browser
}) => {
	const ada = await signIn(browser, 'ada');
	await ada.goto('/inbox', { waitUntil: 'networkidle' });
	const row = ada.locator(`a.hit[data-post="${post.id}"]`);
	await row.click();
	await expect(ada).toHaveURL(new RegExp(`/inbox/posts/${post.id}\\?tab=`));
	await expect(row).toHaveAttribute('aria-current', 'page');
	const pane = ada.locator('.detail');
	await expect(pane.getByRole('article').getByRole('heading', { name: post.title })).toBeVisible();
	await expect(ada.locator('.list-column')).toBeVisible();

	// The address is the pane's: a reload, or the link in another tab, opens it again. The post
	// was read when it opened, so its row has left Unread and waits in Read.
	await ada.reload({ waitUntil: 'networkidle' });
	await expect(pane.getByRole('article').getByRole('heading', { name: post.title })).toBeVisible();
	await expect(row).toHaveCount(0);

	await ada.locator('body').press('Escape');
	await expect(ada).toHaveURL(/\/inbox\?tab=/);
	await expect(pane.getByRole('article').getByRole('heading', { name: post.title })).toHaveCount(0);

	await ada.goto('/inbox?tab=read', { waitUntil: 'networkidle' });
	await ada.locator('body').press('j');
	await expect(row).toBeFocused();
	await ada.keyboard.press('Enter');
	await expect(ada).toHaveURL(new RegExp(`/inbox/posts/${post.id}`));
	await ada.context().close();
});

test('below 1024px an inbox row opens the post’s own page', async ({ browser }) => {
	unreadFixture();
	const ada = await signIn(browser, 'ada', { width: 900, height: 800 });
	await ada.goto('/inbox', { waitUntil: 'networkidle' });
	await ada.locator(`a.hit[data-post="${post.id}"]`).click();
	await expect(ada).toHaveURL(`/posts/${post.id}`);
	await ada.context().close();
});

test('each thread has its own reply box, and Cmd or Ctrl+Enter sends the reply there', async ({
	browser
}) => {
	const ada = await signIn(browser, 'ada');
	await ada.goto(`/posts/${posts.packing.id}`, { waitUntil: 'networkidle' });
	const thread = ada.locator('.thread', { hasText: comment.text });
	const reply = thread.getByRole('textbox', { name: 'Write a reply…' });
	const send = thread.getByRole('button', { name: 'Reply' });
	await expect(reply).toBeVisible();
	await reply.click();
	await expect(send).toBeDisabled();
	// Cancel on the empty box lets go of it, folding its controls away.
	await thread.getByRole('button', { name: 'Cancel' }).click();
	await expect(send).toBeHidden();
	await reply.click();
	await ada.keyboard.type('I have the maps');
	await expect(send).toBeEnabled();
	await ada.keyboard.press('ControlOrMeta+Enter');
	await expect(thread.locator('.comment', { hasText: 'I have the maps' })).toBeVisible();
	await ada.reload({ waitUntil: 'networkidle' });
	await expect(thread.locator('.comment', { hasText: 'I have the maps' })).toBeVisible();
	await ada.context().close();
});

test('on a phone a thread’s reply row hands the reply to the box at the bottom', async ({
	browser
}) => {
	const ada = await signIn(browser, 'ada', phone);
	await ada.goto(`/posts/${posts.packing.id}`, { waitUntil: 'networkidle' });
	const thread = ada.locator('.thread', { hasText: comment.text });
	await expect(thread.getByRole('textbox', { name: 'Write a reply…' })).toBeHidden();
	await thread.getByRole('button', { name: 'Write a reply…' }).click();
	await expect(ada.getByText('Replying to Bo')).toBeVisible();
	const box = ada.locator('.composer');
	await expect(box.getByRole('textbox', { name: 'Write a reply…' })).toBeFocused();
	await ada.keyboard.type('Packed the lanterns');
	await box.getByRole('button', { name: 'Reply', exact: true }).click();
	await expect(thread.locator('.comment', { hasText: 'Packed the lanterns' })).toBeVisible();
	await expect(ada.getByText('Replying to Bo')).toHaveCount(0);
	await ada.context().close();
});

test('New post opens a dialog over Home, picks a project, and the post lands in the feed', async ({
	browser
}) => {
	const ada = await signIn(browser, 'ada');
	await ada.goto('/', { waitUntil: 'networkidle' });
	const newPost = ada.getByRole('button', { name: 'Start a thread or a document' });
	const tellPeople = ada.getByRole('menuitem', { name: /^New thread/ });
	const dialog = ada.getByRole('dialog', { name: 'New thread' });
	// Alt-click is the browser's download, not the dialog.
	const download = ada.waitForEvent('download');
	await newPost.click();
	await tellPeople.click({ modifiers: ['Alt'] });
	await download;
	await expect(dialog).toHaveCount(0);
	await newPost.click();
	await tellPeople.click();
	await expect(dialog).toBeVisible();
	await expect(ada).toHaveURL(`/projects/${project.id}/new`);
	await expect(ada.getByRole('heading', { name: 'Home' })).toBeAttached();
	// No formatting toolbar: only the attach button sits along the bottom.
	await expect(dialog.getByRole('button', { name: 'Bold' })).toHaveCount(0);
	await expect(dialog.getByRole('button', { name: 'Start thread' })).toBeDisabled();
	await expect(dialog.getByRole('button', { name: 'Save draft' })).toBeDisabled();

	// ⌘P or Ctrl+P opens the picker; it searches, and checks the project picked.
	await dialog.getByRole('textbox', { name: 'Title' }).click();
	await ada.keyboard.press('ControlOrMeta+p');
	const search = ada.getByRole('searchbox', { name: 'Search channels' });
	await expect(search).toBeVisible();
	const options = ada.getByLabel('Change channel', { exact: true });
	await expect(options.getByRole('button', { name: project.name, exact: true })).toHaveAttribute(
		'aria-current',
		'true'
	);
	await search.fill('cam');
	await expect(options.getByRole('button', { name: project.name, exact: true })).toHaveCount(0);
	await options.getByRole('button', { name: camp.name, exact: true }).click();
	await expect(dialog.getByRole('button', { name: camp.name, exact: true })).toBeVisible();

	await dialog.getByRole('textbox', { name: 'Title' }).fill('Firewood rota');
	await ada.keyboard.press('Enter');
	await expect(dialog.getByRole('textbox', { name: /^Write something/ })).toBeFocused();
	await ada.keyboard.type('Two armfuls each');
	// Selecting text brings up the formatting menu.
	await ada.keyboard.press('Shift+Home');
	await expect(dialog.getByRole('button', { name: 'Bold' })).toBeVisible();
	await dialog.getByRole('button', { name: 'Start thread' }).click();

	await expect(dialog).toHaveCount(0);
	await expect(ada).toHaveURL('/');
	await expect(ada.getByText('Thread created')).toBeVisible();
	await expect(ada.getByRole('link', { name: 'Firewood rota' }).first()).toBeVisible();
	await expect(newPost).toBeFocused();
	await ada.context().close();
});

test('a publish the server refuses says why inside the dialog', async ({ browser }) => {
	const ada = await signIn(browser, 'ada');
	await ada.goto('/', { waitUntil: 'networkidle' });
	await ada.getByRole('button', { name: 'Start a thread or a document' }).click();
	await ada.getByRole('menuitem', { name: /^New thread/ }).click();
	const dialog = ada.getByRole('dialog', { name: 'New thread' });
	await dialog.getByRole('textbox', { name: 'Title' }).fill('Kindling');
	await dialog.getByRole('button', { name: 'Start thread' }).click();
	await expect(dialog.getByRole('alert')).toHaveText(
		'Write something before you start the thread.'
	);
	await expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveValue('Kindling');
	await ada.context().close();
});

test('Esc keeps what was typed as a draft, and the /new address opens the dialog', async ({
	browser
}) => {
	const ada = await signIn(browser, 'ada');
	await ada.goto(`/projects/${project.id}/new`, { waitUntil: 'networkidle' });
	const dialog = ada.getByRole('dialog', { name: 'New thread' });
	await expect(dialog).toBeVisible();
	await expect(ada.getByRole('heading', { name: project.name })).toBeAttached();

	// Focus stays inside while the dialog is open.
	for (let i = 0; i < 12; i++) await ada.keyboard.press('Tab');
	expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);

	await dialog.getByRole('textbox', { name: 'Title' }).fill('Half a thought');
	await ada.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(ada.getByText('Draft saved')).toBeVisible();
	await expect(ada).toHaveURL(`/projects/${project.id}`);
	await ada.goto('/drafts');
	await expect(ada.getByRole('link', { name: 'Half a thought' })).toBeVisible();
	await ada.context().close();
});

test('a title typed on a draft before the page has finished loading is kept', async ({
	browser
}) => {
	const ada = await signIn(browser, 'ada');
	await ada.goto('/drafts', { waitUntil: 'networkidle' });
	const draft = await ada.getByRole('link', { name: 'Half a thought' }).getAttribute('href');
	let release!: () => void;
	const typed = new Promise<void>((resolve) => (release = resolve));
	await ada.route('**/_app/immutable/entry/app.*.js', async (route) => {
		await typed;
		await route.continue();
	});
	await ada.goto(draft!, { waitUntil: 'domcontentloaded' });
	await ada.getByRole('textbox', { name: 'Title' }).fill('Early bird');
	release();
	// The poll editor opens only once the page is live; a click before then does nothing.
	const option = ada.getByRole('textbox', { name: 'Option 1' });
	await expect(async () => {
		if (!(await option.isVisible()))
			await ada.getByRole('button', { name: 'Add a poll' }).click({ timeout: 1000 });
		await expect(option).toBeVisible({ timeout: 1000 });
	}).toPass();
	await expect(ada.getByRole('textbox', { name: 'Title' })).toHaveValue('Early bird');
	// The draft saves under that title too.
	const saved = ada.waitForResponse((r) => r.request().method() === 'PUT' && r.ok());
	await ada.getByRole('textbox', { name: /^Write something/ }).fill('Worms');
	await saved;
	await ada.goto('/drafts');
	await expect(ada.getByRole('link', { name: 'Early bird' })).toBeVisible();
	await ada.context().close();
});
