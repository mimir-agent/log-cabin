// A call can be shared into a channel after it started, with view or edit permission, and taken
// out again; and settings show the member's own call link, which copies with a toast.
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { calls } from '../../src/lib/strings/calls.ts';
import { baseURL, people, persistTo, project, zoned } from './fixtures.ts';

const s = calls.share;
const callId = '01E2ESHARECA11000000000000';
const callUrl = `/calls/${callId}`;

function d1(sql: string) {
	execFileSync(
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
			'--command',
			sql
		],
		{ encoding: 'utf8' }
	);
}

/** A live call Ada started in her thread with Dee, which Cy is not in and so can't see. */
test.beforeAll(() => {
	d1(
		`INSERT INTO calls (id, thread_id, started_by, started_at) VALUES ('${callId}', '${zoned.threadId}', '${people.ada.id}', ${Date.now()})`
	);
});

test.use({ baseURL });

async function signInAs(context: import('@playwright/test').BrowserContext, token: string) {
	await context.addCookies([{ name: 'campfire_session', value: token, url: baseURL }]);
}

test('shares a call into a channel, where its members can then open it, and takes it out again', async ({
	browser
}) => {
	const adaContext = await browser.newContext({ baseURL });
	await signInAs(adaContext, people.ada.token);
	const ada = await adaContext.newPage();
	const cyContext = await browser.newContext({ baseURL });
	await signInAs(cyContext, people.cy.token);
	const cy = await cyContext.newPage();
	expect((await cy.goto(callUrl))!.status()).toBe(404);

	await ada.goto(callUrl, { waitUntil: 'networkidle' });
	await ada.getByRole('button', { name: s.title }).click();
	const dialog = ada.getByRole('dialog', { name: s.title });
	await dialog.getByLabel(s.channel).selectOption({ label: project.name });
	await dialog.getByRole('radio', { name: s.edit }).check();
	await dialog.getByRole('button', { name: s.submit }).click();
	await expect(ada.getByText(s.shared(project.name))).toBeVisible();

	expect((await cy.goto(callUrl))!.status()).toBe(200);

	await ada.getByRole('button', { name: s.title }).click();
	await ada.getByRole('dialog', { name: s.title }).getByRole('button', { name: s.remove }).click();
	await expect(ada.getByText(s.removed)).toBeVisible();

	expect((await cy.goto(callUrl))!.status()).toBe(404);
});

test('settings show the member’s personal call link, and Copy puts it on the clipboard with a toast', async ({
	browser
}) => {
	const context = await browser.newContext({ baseURL });
	await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
	await signInAs(context, people.ada.token);
	const page = await context.newPage();
	await page.goto('/settings/profile', { waitUntil: 'networkidle' });

	const section = page.getByRole('region', { name: calls.personalLink.title });
	await expect(section).toBeVisible();
	await section.getByRole('button', { name: calls.personalLink.copy }).click();

	await expect(page.getByText(calls.personalLink.copied)).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		`${baseURL}/calls/room/ada`
	);
});
