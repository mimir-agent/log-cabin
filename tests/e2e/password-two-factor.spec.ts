// Passwords and two-factor sign-in, end to end: the built Worker under `wrangler dev`,
// each sign-in in a fresh browser context with no cookies.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { codeAt, stepAt } from '../../src/lib/server/auth/totp.ts';
import { auth } from '../../src/lib/strings/auth.ts';
import { baseURL, people } from './fixtures.ts';

const fay = people.fay;
const email = `${fay.name.toLowerCase()}@example.com`;
const password = 'correct horse campfire battery 7302';
const s = auth.security;

async function signedIn(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: fay.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto('/settings/security');
	return page;
}

async function signInWithPassword(browser: Browser): Promise<Page> {
	const page = await (await browser.newContext({ baseURL })).newPage();
	await page.goto('/login/password');
	await page.getByLabel(auth.password.email).fill(email);
	await page.getByLabel(auth.password.password, { exact: true }).fill(password);
	await page.getByRole('button', { name: auth.password.submit }).click();
	return page;
}

test.describe.configure({ mode: 'serial' });

let secret = '';
let recoveryCodes: string[] = [];

test('a member sets a password in settings, then signs in with it in a fresh browser', async ({
	browser
}) => {
	const settings = await signedIn(browser);
	await settings.getByLabel(s.newPassword).fill(password);
	await settings.getByRole('button', { name: s.setPassword }).click();
	await expect(settings.getByRole('main').getByRole('status')).toHaveText(s.passwordSaved);

	const page = await signInWithPassword(browser);
	await expect(page).toHaveURL(`${baseURL}/`);
});

test('turning on two-factor shows the key and 10 recovery codes once', async ({ browser }) => {
	const settings = await signedIn(browser);
	await settings.getByRole('button', { name: s.turnOn }).click();
	await expect(settings.getByRole('img', { name: s.qrAlt })).toBeVisible();
	secret = (await settings.getByText(`${s.manualKey}:`).locator('code').textContent()) ?? '';
	expect(secret, 'the manual key shown next to the QR code').toMatch(/^[A-Z2-7]{32}$/);

	await settings.getByLabel(s.confirmCode).fill(await codeAt(secret, stepAt(Date.now())));
	await settings.getByRole('button', { name: s.confirm }).click();
	await expect(settings.getByRole('heading', { name: s.codesTitle })).toBeVisible();
	recoveryCodes = await settings.locator('ol code').allTextContents();
	expect(recoveryCodes).toHaveLength(10);

	await settings.reload();
	await expect(settings.getByText(s.twoFactorOn)).toBeVisible();
	await expect(settings.getByRole('heading', { name: s.codesTitle })).toHaveCount(0);
});

test('with two-factor on, a password sign-in asks for a code before signing in', async ({
	browser
}) => {
	const page = await signInWithPassword(browser);
	await expect(page).toHaveURL(`${baseURL}/login/two-factor`);
	await page.goto('/');
	await expect(page, 'no session before the code is given').toHaveURL(/\/login/);

	await page.goto('/login/two-factor');
	await page.getByLabel(auth.twoFactor.code).fill(recoveryCodes[0]);
	await page.getByRole('button', { name: auth.twoFactor.submit }).click();
	await expect(page).toHaveURL(`${baseURL}/`);
});

test('a used recovery code is refused, and a fresh app code signs in', async ({ browser }) => {
	const page = await signInWithPassword(browser);
	const code = page.getByLabel(auth.twoFactor.code);
	await code.fill(recoveryCodes[0]);
	await page.getByRole('button', { name: auth.twoFactor.submit }).click();
	await expect(page.getByRole('alert')).toHaveText(auth.twoFactor.errors.wrong);

	// The step after the one used to turn two-factor on: a code is accepted once.
	await code.fill(await codeAt(secret, stepAt(Date.now()) + 1));
	await page.getByRole('button', { name: auth.twoFactor.submit }).click();
	await expect(page).toHaveURL(`${baseURL}/`);
});
