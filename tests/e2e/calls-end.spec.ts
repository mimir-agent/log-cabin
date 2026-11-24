// Whoever started a call can end it for everyone from the call's own screen once joined,
// and the page under that screen is out of reach: nothing under it takes focus or a click.
// The browsers join with a stand-in for the SFU (standInSfu), so no media leaves them.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { calls } from '../../src/lib/strings/calls.ts';
import { baseURL, endingCalls, people, type Person } from './fixtures.ts';
import { standInSfu } from './stand-in-sfu.ts';

const s = calls.room;
const { project: live, thread: other } = endingCalls;

test.use({
	launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }
});

async function open(
	browser: Browser,
	who: Person,
	callId: string,
	size = { width: 1280, height: 800 }
) {
	const context = await browser.newContext({ baseURL, viewport: size });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	const participant = (live.participants as Record<string, string>)[who] ?? '';
	await context.addInitScript(standInSfu, participant);
	const page = await context.newPage();
	await page.goto(`/calls/${callId}`, { waitUntil: 'networkidle' });
	return page;
}

const screenOf = (page: Page) =>
	page.getByRole('region').filter({ has: page.getByRole('toolbar') });
const endButton = (page: Page) => page.getByRole('button', { name: s.end });

async function join(page: Page) {
	await page.getByRole('button', { name: s.join, exact: true }).click();
	await expect(screenOf(page)).toBeVisible();
}

/** What each of the page's peer connections is doing now. */
const connections = (page: Page) =>
	page.evaluate(() =>
		(window as unknown as { calls: RTCPeerConnection[] }).calls.map((pc) => pc.connectionState)
	);

test('a joined starter sees the end button in the bar, and a click reaches it, at either size', async ({
	browser
}) => {
	for (const size of [
		{ width: 1280, height: 800 },
		{ width: 390, height: 844 }
	]) {
		const page = await open(browser, 'ada', live.id, size);
		await join(page);
		const end = screenOf(page).getByRole('button', { name: s.end });
		await expect(end, `${size.width}px`).toBeVisible();
		// A trial click does every check a click does, the one for what's on top included.
		await end.click({ trial: true, timeout: 2000 });
		await page.context().close();
	}
});

test('at 390px the bar fits: a long title cuts off and Invite and End stay on screen', async ({
	browser
}) => {
	const page = await open(browser, 'ada', live.id, { width: 390, height: 844 });
	await join(page);
	const bar = screenOf(page).locator('header');
	const title = bar.getByRole('heading');
	await title.evaluate(
		(h) => (h.textContent = 'A very long name for a place to call in '.repeat(4))
	);
	expect(await title.evaluate((h) => h.scrollWidth > h.clientWidth)).toBe(true);
	expect(await bar.evaluate((b) => b.scrollWidth <= b.clientWidth)).toBe(true);
	for (const name of [calls.ringing.invite, s.end]) {
		const box = (await bar.getByRole('button', { name }).boundingBox())!;
		expect(box.x, name).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width, name).toBeLessThanOrEqual(390);
	}
	await page.context().close();
});

test('someone who did not start the call sees no end button, joined or not', async ({
	browser
}) => {
	const page = await open(browser, 'cy', live.id);
	await expect(page.getByRole('button', { name: s.join, exact: true })).toBeVisible();
	await expect(endButton(page)).toHaveCount(0);
	await join(page);
	await expect(endButton(page)).toHaveCount(0);
	await page.context().close();
});

test('while joined, Tab goes only through the call screen', async ({ browser }) => {
	const page = await open(browser, 'ada', live.id);
	await join(page);
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	const screen = screenOf(page);
	const reached = new Set<string>();
	for (let step = 1; step <= 40; step++) {
		await page.keyboard.press('Tab');
		const where = await screen.evaluate((el) => {
			const focused = document.activeElement!;
			// Past the last control focus goes out to the browser's own UI, and the page has
			// nothing focused: the body.
			if (focused === document.body) return { inside: true, what: 'nothing' };
			const name = focused.getAttribute('aria-label') ?? focused.textContent?.trim() ?? '';
			return { inside: el.contains(focused), what: `${focused.tagName} ${name}` };
		});
		expect(where.inside, `step ${step}: ${where.what}`).toBe(true);
		reached.add(where.what);
	}
	// It went round: the bar's buttons and the controls all came up.
	expect([...reached].join('\n')).toContain(s.end);
	expect([...reached].join('\n')).toContain(s.leave);
	await page.context().close();
});

test('while joined, Invite, the devices and the leave question still open and work', async ({
	browser
}) => {
	const page = await open(browser, 'ada', live.id);
	// Out to the calls and back inside the app, so going forward again is a move the
	// call asks about rather than a new page load.
	await page.getByRole('link', { name: calls.index.title, exact: true }).first().click();
	await page.waitForURL('/calls');
	await page.goBack();
	await join(page);

	await screenOf(page).getByRole('button', { name: calls.ringing.invite }).click();
	const invite = page.getByRole('dialog', { name: calls.ringing.inviteTitle });
	await expect(invite).toBeVisible();
	await expect(invite.locator(':focus')).toHaveCount(1);
	await invite.getByRole('button', { name: calls.ringing.cancel }).click();
	await expect(invite).toHaveCount(0);

	await screenOf(page).getByRole('button', { name: calls.devices.settings }).click();
	const camera = screenOf(page).getByRole('combobox', { name: calls.devices.kinds.videoinput });
	await camera.focus();
	await expect(camera).toBeFocused();
	const noise = screenOf(page).getByRole('switch', { name: calls.devices.noiseCancellation });
	const before = await noise.getAttribute('aria-checked');
	await noise.click();
	await expect(noise).not.toHaveAttribute('aria-checked', before!);

	await page.evaluate(() => history.forward());
	const leave = page.getByRole('dialog', { name: s.leaveTitle });
	await expect(leave).toBeVisible();
	await expect(leave.locator(':focus')).toHaveCount(1);
	await leave.getByRole('button', { name: s.stay }).click();
	await expect(leave).toHaveCount(0);
	await expect(screenOf(page)).toBeVisible();
	await page.context().close();
});

test('ending from the call screen ends it on both sides and closes both connections', async ({
	browser
}) => {
	const ada = await open(browser, 'ada', live.id);
	const cy = await open(browser, 'cy', live.id);
	await join(ada);
	await join(cy);

	await screenOf(ada).getByRole('button', { name: s.end }).click();
	for (const page of [ada, cy]) {
		await expect(page.getByText(calls.recording.notRecorded)).toBeVisible({ timeout: 3000 });
		await expect(screenOf(page)).toHaveCount(0);
		expect(await connections(page)).toEqual(['closed']);
	}
	await ada.context().close();
	await cy.context().close();
});

test('not joined, the header still ends the call for everyone', async ({ browser }) => {
	const ada = await open(browser, 'ada', other.id);
	await endButton(ada).click();
	await expect(ada.getByText(calls.recording.notRecorded)).toBeVisible({ timeout: 3000 });
	await expect(endButton(ada)).toHaveCount(0);
	await ada.context().close();
});
