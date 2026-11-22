// An ended call's recordings: the person who started it can delete them all, someone else can't,
// and the transcript downloads as SRT, VTT and text.
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { calls } from '../../src/lib/strings/calls.ts';
import { core } from '../../src/lib/strings/core.ts';
import { baseURL, people, persistTo } from './fixtures.ts';

const s = calls.recording;
const ids = {
	call: '01E2ERECCA11ENDED000000000C',
	adaIn: '01E2ERECPART1ADA0000000000',
	boIn: '01E2ERECPART1B000000000000',
	recording: '01E2ERECREC0RD1NG000000000',
	track: '01E2ERECTRACK000000000000',
	segment: '01E2ERECSEGMENT0000000000',
	line: '01E2ERECL1NE000000000000'
};
const startedAt = Date.UTC(2026, 10, 19, 21, 0);
const callUrl = `/calls/${ids.call}`;

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

/** A call Ada started and Bo was in, over, with one ready recording and a one-line transcript. */
test.beforeAll(() => {
	const { ada, bo } = people;
	d1(
		[
			`INSERT INTO calls (id, room_owner_id, started_by, started_at, ended_at, title) VALUES ('${ids.call}', '${ada.id}', '${ada.id}', ${startedAt}, ${startedAt + 180_000}, 'Recorded sync')`,
			`INSERT INTO call_participants (id, call_id, user_id, session_id, joined_at, left_at) VALUES ('${ids.adaIn}', '${ids.call}', '${ada.id}', 'rec-ada', ${startedAt}, ${startedAt + 180_000}), ('${ids.boIn}', '${ids.call}', '${bo.id}', 'rec-bo', ${startedAt}, ${startedAt + 180_000})`,
			`INSERT INTO call_recordings (id, call_id, started_by, started_at, stopped_at, status) VALUES ('${ids.recording}', '${ids.call}', '${ada.id}', ${startedAt}, ${startedAt + 180_000}, 'ready')`,
			`INSERT INTO call_recording_tracks (id, recording_id, participant_id, opened_at) VALUES ('${ids.track}', '${ids.recording}', '${ids.adaIn}', ${startedAt})`,
			`INSERT INTO call_recording_segments (id, recording_id, track_id, seq, r2_key, start_ms, duration_ms, status, created_at) VALUES ('${ids.segment}', '${ids.recording}', '${ids.track}', 0, 'none', 0, 60000, 'done', ${startedAt})`,
			`INSERT INTO call_transcript_lines (id, recording_id, segment_id, start_ms, end_ms, text) VALUES ('${ids.line}', '${ids.recording}', '${ids.segment}', 5000, 9000, 'We ship Friday.')`
		].join(';\n')
	);
});

test.use({ baseURL });

async function signInAs(context: import('@playwright/test').BrowserContext, token: string) {
	await context.addCookies([{ name: 'campfire_session', value: token, url: baseURL }]);
}

test('offers the three transcript downloads, and the SRT link returns the file', async ({
	page,
	context
}) => {
	await signInAs(context, people.bo.token);
	await page.goto(callUrl);

	for (const format of ['srt', 'vtt', 'txt'] as const) {
		await expect(
			page.getByRole('link', { name: s.downloadAs(s.downloadFormats[format]) })
		).toHaveAttribute(
			'href',
			`/calls/${ids.call}/recordings/${ids.recording}/transcript/${format}`
		);
	}
	const file = await page.request.get(
		`/calls/${ids.call}/recordings/${ids.recording}/transcript/srt`
	);
	expect(file.status()).toBe(200);
	expect(await file.text()).toBe('1\n00:00:05,000 --> 00:00:09,000\nAda: We ship Friday.\n');
});

test('shows someone who did not start the call no menu to delete its recordings', async ({
	page,
	context
}) => {
	await signInAs(context, people.bo.token);
	await page.goto(callUrl);

	await expect(page.getByText('We ship Friday.')).toBeVisible();
	await expect(page.getByRole('button', { name: core.actions.more })).toHaveCount(0);
});

test('deletes every recording from the call page when the person who started the call confirms', async ({
	page,
	context
}) => {
	await signInAs(context, people.ada.token);
	await page.goto(callUrl, { waitUntil: 'networkidle' });
	await expect(page.getByText('We ship Friday.')).toBeVisible();

	await page.getByRole('button', { name: core.actions.more }).click();
	await page.getByRole('menuitem', { name: s.deleteAll }).click();
	await page
		.getByRole('dialog', { name: s.deleteAllTitle })
		.getByRole('button', { name: s.deleteAllConfirm })
		.click();

	await expect(page.getByText(s.deleteAllDone)).toBeVisible();
	await page.reload();
	await expect(page.getByRole('heading', { name: s.transcript })).toHaveCount(0);
	await expect(page.getByText('We ship Friday.')).toHaveCount(0);
	await expect(page.getByRole('button', { name: core.actions.more })).toHaveCount(0);
});
