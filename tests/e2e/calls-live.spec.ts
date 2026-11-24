// Calls going on now, for a second person who has the page open: the dot beside Calls, the row
// on the Calls page and the faces in it all appear without a reload when someone starts and
// joins a call, and Join on the row takes them in. Bo's join is a participant row written to the
// database (the SFU a real join needs doesn't exist here); the page he opens then tells the hub.
import { expect, test } from '@playwright/test';
import { calls } from '../../src/lib/strings/calls.ts';
import { shell } from '../../src/lib/strings/shell.ts';
import { baseURL, people } from './fixtures.ts';
import { d1 } from './database.ts';
import { standInSfu } from './stand-in-sfu.ts';

test.use({
	baseURL,
	launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }
});

test('Ada sees the dot, the row and Bo’s face as Bo starts and joins a call, then joins it', async ({
	browser
}) => {
	const ada = await browser.newContext({ baseURL });
	await ada.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	await ada.addInitScript(standInSfu, 'ada-stand-in');
	const adaPage = await ada.newPage();
	await adaPage.goto('/calls', { waitUntil: 'networkidle' });
	const rows = adaPage.getByRole('region', { name: calls.index.live }).getByRole('status');
	const dot = adaPage.getByRole('link', { name: /^Calls/ }).getByRole('img');
	// Calls other specs left live count too; the dot and the rows both count them.
	const before = await rows.count();
	await expect(dot).toHaveCount(before ? 1 : 0);

	// Bo starts the call in his own room, as the room's Join does.
	const bo = await browser.newContext({ baseURL });
	await bo.addCookies([{ name: 'campfire_session', value: people.bo.token, url: baseURL }]);
	const started = await bo.request.post('/calls/room/bo?/join', {
		headers: { accept: 'text/html', origin: baseURL },
		form: {},
		maxRedirects: 0
	});
	expect(started.status()).toBe(303);
	const callId = started.headers().location.split('/').pop()!;

	await expect(dot).toHaveAttribute('aria-label', shell.callsLive(before + 1));

	const row = rows.filter({ hasText: 'Bo’s room' });
	await expect(row).toBeVisible();
	await expect(row).toContainText(calls.index.elapsed(0));
	await expect(row.getByRole('link', { name: 'Bo', exact: true })).toHaveCount(0);

	// Bo is in the call: a participant that stays an hour, and his page opens the call's topic.
	const boIn = '01E2ELIVEPART1B000000000000';
	d1(
		`INSERT INTO call_participants (id, call_id, user_id, session_id, joined_at) VALUES ('${boIn}', '${callId}', '${people.bo.id}', 'live-bo', ${Date.now() + 3_600_000})`
	);
	const boPage = await bo.newPage();
	await boPage.goto(`/calls/${callId}`, { waitUntil: 'networkidle' });
	const face = row.getByRole('link', { name: 'Bo', exact: true });
	await expect(face).toHaveAttribute('href', `/people/id/${people.bo.id}`);

	await row.getByRole('link', { name: calls.place.join }).click();
	await expect(adaPage).toHaveURL(`/calls/${callId}`);
	await adaPage.getByRole('button', { name: calls.room.join, exact: true }).click();
	await expect(
		adaPage.getByRole('region').filter({ has: adaPage.getByRole('toolbar') })
	).toBeVisible();

	// Bo leaves, which ends the call, so it doesn't stay live for the specs after this one.
	const left = await bo.request.post(`/calls/${callId}/sfu`, {
		data: { op: 'leave', participantId: boIn }
	});
	expect(left.status()).toBe(200);
	await ada.close();
	await bo.close();
});
