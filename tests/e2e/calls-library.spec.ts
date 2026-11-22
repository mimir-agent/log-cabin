// The calls page as a library of meetings: a call going on with Join at the top, every ended call
// with its title, summary and recording marks, each opening its own page, and a way to start one.
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { calls } from '../../src/lib/strings/calls.ts';
import { baseURL, people, persistTo } from './fixtures.ts';

const s = calls.index;
const ids = {
	ended: '01E2ELIBCA11ENDED00000000C',
	live: '01E2ELIBCA11LIVE000000000C',
	adaIn: '01E2ELIBPART1ADA0000000000',
	boIn: '01E2ELIBPART1B000000000000',
	cyIn: '01E2ELIBPART1CY0000000000',
	recording: '01E2ELIBREC0RD1NG000000000',
	track: '01E2ELIBTRACK000000000000',
	segment: '01E2ELIBSEGMENT0000000000',
	line: '01E2ELIBL1NE000000000000'
};
const startedAt = Date.UTC(2026, 10, 19, 20, 0);
const summary = {
	sections: [
		{
			kind: 'summary',
			summary: {
				bullets: [{ text: 'Ada wants to ship on Friday.', cites: [1] }],
				sources: [
					{
						id: 1,
						author: 'Ada',
						kind: '0:05',
						text: 'We ship Friday.',
						lineId: ids.line,
						startMs: 5000
					}
				]
			}
		}
	]
};

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

/**
 * A recorded call Ada and Bo had, over, with a title, a summary and a one-line transcript; and
 * one going on in Cy's room, dated an hour ahead so nobody is taken out of it while this runs.
 */
test.beforeAll(() => {
	const { ada, bo, cy } = people;
	d1(
		[
			`INSERT INTO calls (id, room_owner_id, started_by, started_at, ended_at, title, summary) VALUES ('${ids.ended}', '${ada.id}', '${ada.id}', ${startedAt}, ${startedAt + 180_000}, 'Launch plan', '${JSON.stringify(summary)}')`,
			`INSERT INTO call_participants (id, call_id, user_id, session_id, joined_at, left_at) VALUES ('${ids.adaIn}', '${ids.ended}', '${ada.id}', 'lib-ada', ${startedAt}, ${startedAt + 180_000}), ('${ids.boIn}', '${ids.ended}', '${bo.id}', 'lib-bo', ${startedAt}, ${startedAt + 180_000})`,
			`INSERT INTO call_recordings (id, call_id, started_by, started_at, stopped_at, status) VALUES ('${ids.recording}', '${ids.ended}', '${ada.id}', ${startedAt}, ${startedAt + 180_000}, 'ready')`,
			`INSERT INTO call_recording_tracks (id, recording_id, participant_id, opened_at) VALUES ('${ids.track}', '${ids.recording}', '${ids.adaIn}', ${startedAt})`,
			`INSERT INTO call_recording_segments (id, recording_id, track_id, seq, r2_key, start_ms, duration_ms, status, created_at) VALUES ('${ids.segment}', '${ids.recording}', '${ids.track}', 0, 'none', 0, 60000, 'done', ${startedAt})`,
			`INSERT INTO call_transcript_lines (id, recording_id, segment_id, start_ms, end_ms, text) VALUES ('${ids.line}', '${ids.recording}', '${ids.segment}', 5000, 9000, 'We ship Friday.')`,
			`INSERT INTO calls (id, room_owner_id, started_by, started_at) VALUES ('${ids.live}', '${cy.id}', '${cy.id}', ${Date.now()})`,
			`INSERT INTO call_participants (id, call_id, user_id, session_id, joined_at) VALUES ('${ids.cyIn}', '${ids.live}', '${cy.id}', 'lib-cy', ${Date.now() + 3_600_000})`
		].join(';\n')
	);
});

test.use({ baseURL });

test.beforeEach(async ({ context }) => {
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
});

test('lists the call going on with Join, above the ended calls', async ({ page }) => {
	await page.goto('/calls');

	const live = page.getByRole('region', { name: s.live });
	await expect(live).toContainText('Cy’s room');
	await expect(live.locator(`a[href="/calls/${ids.live}"]`)).toHaveText(calls.place.join);
});

test('shows an ended call with its title, summary and recording marks, and opens its own page', async ({
	page
}) => {
	await page.goto('/calls');

	const row = page.getByRole('listitem').filter({ hasText: 'Launch plan' });
	await expect(row).toContainText('Ada wants to ship on Friday.');
	await expect(row.getByRole('img', { name: s.recorded })).toBeVisible();
	await expect(row.getByRole('img', { name: s.transcribed })).toBeVisible();

	await row.getByRole('link', { name: 'Launch plan' }).click();

	await expect(page).toHaveURL(`/calls/${ids.ended}`);
	await expect(page.getByRole('heading', { level: 1, name: 'Launch plan' })).toBeVisible();
	await expect(page.getByRole('article').getByText('Launch plan', { exact: true })).toBeVisible();
	await expect(page.getByText('Ada wants to ship on Friday.')).toBeVisible();
	await expect(page.getByRole('heading', { name: calls.recording.transcript })).toBeVisible();
	await expect(page.getByText('We ship Friday.')).toBeVisible();
	await expect(page.getByRole('button', { name: calls.room.join, exact: true })).toHaveCount(0);
});

test('shows the Joined view of someone who has been in no call, with the one going on still above it', async ({
	browser
}) => {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people.dee.token, url: baseURL }]);
	const page = await context.newPage();

	await page.goto('/calls?filter=joined');

	await expect(page.getByRole('region', { name: s.live })).toBeVisible();
	await expect(page.getByText(s.empty.joined)).toBeVisible();
	await context.close();
});

test('starts a call in your own room', async ({ page }) => {
	await page.goto('/calls', { waitUntil: 'networkidle' });

	await page.getByRole('button', { name: s.start }).click();

	await expect(page).toHaveURL(/\/calls\/[0-9A-HJKMNP-TV-Z]{26}$/);
	await expect(page.getByRole('button', { name: calls.room.join, exact: true })).toBeVisible();
});
