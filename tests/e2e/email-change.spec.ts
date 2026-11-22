// Changing the sign-in email: the new address confirms by a link, then signs in. Mail comes
// from the dev mailbox table, read straight from the running server's database.
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { auth } from '../../src/lib/strings/auth.ts';
import { baseURL, persistTo, people } from './fixtures.ts';

const dee = people.dee;
const oldEmail = 'dee@example.com';
const newEmail = 'dee.new@example.com';
const s = auth.emailChange;

test.describe.configure({ mode: 'serial' });

function mailTo(address: string): string {
	const out = execFileSync(
		'pnpm',
		[
			'exec',
			'wrangler',
			'd1',
			'execute',
			'campfire',
			'--local',
			'--persist-to',
			persistTo,
			'--json',
			'--command',
			`SELECT text_body FROM dev_mail WHERE to_address = '${address}' ORDER BY rowid DESC LIMIT 1`
		],
		{ encoding: 'utf8' }
	);
	const rows = JSON.parse(out)[0].results as { text_body: string }[];
	if (rows.length === 0) throw new Error(`expected a mail to ${address} in dev_mail, found none`);
	return rows[0].text_body;
}

/** The newest link to `path` mailed to `address`, once the mail has arrived. */
async function mailLink(address: string, path: string): Promise<string> {
	const pattern = new RegExp(`${baseURL}${path}\\?token=\\S+`);
	await expect
		.poll(() => pattern.test(mailTo(address)), { message: `a ${path} link mailed to ${address}` })
		.toBe(true);
	return mailTo(address).match(pattern)![0];
}

test('a member changes their email, confirms by the link, and signs in with the new address', async ({
	browser
}) => {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: dee.token, url: baseURL }]);
	const settings = await context.newPage();
	await settings.goto('/settings/profile', { waitUntil: 'networkidle' });

	await settings.getByRole('button', { name: s.change }).click();
	await settings.getByLabel(s.newEmail).fill(newEmail);
	await settings.getByRole('button', { name: s.send }).click();
	await expect(settings.getByText(s.pending(newEmail))).toBeVisible();

	const confirmLink = await mailLink(newEmail, '/login/confirm-email');
	const opener = await (await browser.newContext({ baseURL })).newPage();
	await opener.goto(confirmLink);
	await expect(opener.getByText(s.confirmIntro(newEmail))).toBeVisible();
	await opener.getByRole('button', { name: s.confirm }).click();
	await expect(opener.getByText(s.done(newEmail))).toBeVisible();

	expect(mailTo(oldEmail), 'the old address hears about the change').toContain(newEmail);

	const signIn = await (await browser.newContext({ baseURL })).newPage();
	await signIn.goto('/login', { waitUntil: 'networkidle' });
	await signIn.getByLabel(auth.login.email).fill(newEmail);
	await signIn.getByRole('button', { name: auth.login.submit }).click();
	await signIn.goto(await mailLink(newEmail, '/login/verify'));
	await signIn.getByRole('button', { name: auth.verify.submit }).click();
	await expect(signIn).toHaveURL(`${baseURL}/`);
});

test('the confirm link works once', async ({ browser }) => {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: dee.token, url: baseURL }]);
	const settings = await context.newPage();
	await settings.goto('/settings/profile', { waitUntil: 'networkidle' });
	await settings.getByRole('button', { name: s.change }).click();
	await settings.getByLabel(s.newEmail).fill('dee.again@example.com');
	await settings.getByRole('button', { name: s.send }).click();
	await expect(settings.getByText(s.pending('dee.again@example.com'))).toBeVisible();

	const link = await mailLink('dee.again@example.com', '/login/confirm-email');
	const page = await (await browser.newContext({ baseURL })).newPage();
	await page.goto(link);
	await page.getByRole('button', { name: s.confirm }).click();
	await expect(page.getByText(s.done('dee.again@example.com'))).toBeVisible();

	await page.goto(link);
	await expect(page.getByText(s.errors.linkInvalid)).toBeVisible();
	await expect(page.getByRole('button', { name: s.confirm })).toHaveCount(0);
});
