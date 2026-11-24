// Playing a call's recording from its transcript: a line or a summary time seeks and plays, the
// line being spoken is marked, and the page only follows it for someone who hasn't scrolled away.
import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { wav } from '../../src/lib/calls/audio.ts';
import { calls } from '../../src/lib/strings/calls.ts';
import { baseURL, people, persistTo } from './fixtures.ts';

const s = calls.recording;
const ids = {
	call: '01E2ESEEKCA11000000000000C',
	ada: '01E2ESEEKPART1ADA0000000000',
	recording: '01E2ESEEKREC0RD1NG000000000',
	track: '01E2ESEEKTRACK000000000000',
	segment: '01E2ESEEKSEGMENT0000000000'
};
const lineCount = 40;
const lineMs = 1500;
const lineId = (n: number) => `01E2ESEEKLINE${String(n).padStart(13, '0')}`;
const startedAt = Date.UTC(2026, 10, 20, 20, 0);
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
						kind: '0:30',
						text: 'Line 21',
						lineId: lineId(21),
						startMs: 20 * lineMs
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

/** A recorded call whose transcript is forty lines, a second and a half each, over a minute of silence. */
test.beforeAll(() => {
	const { ada } = people;
	const lines = Array.from({ length: lineCount }, (_, i) => {
		const start = i * lineMs;
		return `('${lineId(i + 1)}', '${ids.recording}', '${ids.segment}', ${start}, ${start + lineMs}, 'Line ${i + 1}')`;
	});
	d1(
		[
			`INSERT INTO calls (id, room_owner_id, started_by, started_at, ended_at, title, summary) VALUES ('${ids.call}', '${ada.id}', '${ada.id}', ${startedAt}, ${startedAt + 60_000}, 'Seek plan', '${JSON.stringify(summary)}')`,
			`INSERT INTO call_participants (id, call_id, user_id, session_id, joined_at, left_at) VALUES ('${ids.ada}', '${ids.call}', '${ada.id}', 'seek-ada', ${startedAt}, ${startedAt + 60_000})`,
			`INSERT INTO call_recordings (id, call_id, started_by, started_at, stopped_at, status) VALUES ('${ids.recording}', '${ids.call}', '${ada.id}', ${startedAt}, ${startedAt + 60_000}, 'ready')`,
			`INSERT INTO call_recording_tracks (id, recording_id, participant_id, opened_at) VALUES ('${ids.track}', '${ids.recording}', '${ids.ada}', ${startedAt})`,
			`INSERT INTO call_recording_segments (id, recording_id, track_id, seq, r2_key, start_ms, duration_ms, status, created_at) VALUES ('${ids.segment}', '${ids.recording}', '${ids.track}', 0, 'none', 0, 60000, 'done', ${startedAt})`,
			`INSERT INTO call_transcript_lines (id, recording_id, segment_id, start_ms, end_ms, text) VALUES ${lines.join(', ')}`
		].join(';\n')
	);
});

test.use({ baseURL });

test.beforeEach(async ({ context, page }) => {
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	// The segment's audio isn't in the local bucket: answer with a minute of silence.
	const silence = wav(new Int16Array(16_000 * 60));
	await page.route('**/recordings/*/audio/*', (route) =>
		route.fulfill({ contentType: 'audio/wav', body: Buffer.from(silence) })
	);
});

const line = (page: Page, n: number) => page.locator(`#line-${lineId(n)}`);
/** The button that seeks to a line; its name starts with the line's time, unlike its Edit button. */
const seek = (page: Page, n: number) => line(page, n).getByRole('button', { name: /^\d+:\d\d / });
const played = (page: Page) =>
	page.locator('audio').evaluate((el: HTMLAudioElement) => ({
		at: el.currentTime,
		paused: el.paused
	}));

test('plays from a clicked line, and marks the line being spoken as it goes', async ({ page }) => {
	await page.goto(`/calls/${ids.call}`, { waitUntil: 'networkidle' });

	await seek(page, 3).click();

	await expect(line(page, 3)).toHaveAttribute('aria-current', 'true');
	const now = await played(page);
	expect(now.paused).toBe(false);
	expect(now.at).toBeGreaterThanOrEqual(3);
	// Real time: a second and a half on, the next line has taken the mark.
	await expect(line(page, 4)).toHaveAttribute('aria-current', 'true');
	await expect(line(page, 3)).not.toHaveAttribute('aria-current');
	await expect(page.locator('li[aria-current]')).toHaveCount(1);
	await page.screenshot({ path: 'test-results/seek-playing.png' });
});

test('plays from a line when Enter is pressed on it', async ({ page }) => {
	await page.goto(`/calls/${ids.call}`, { waitUntil: 'networkidle' });
	await seek(page, 8).focus();

	await page.keyboard.press('Enter');

	await expect(line(page, 8)).toHaveAttribute('aria-current', 'true');
	expect((await played(page)).at).toBeGreaterThanOrEqual(10.5);
});

test('plays from the time a summary point cites', async ({ page }) => {
	await page.goto(`/calls/${ids.call}`, { waitUntil: 'networkidle' });

	await page.getByRole('link', { name: s.citation('0:30') }).click();

	await expect(line(page, 21)).toHaveAttribute('aria-current', 'true');
	expect((await played(page)).at).toBeGreaterThanOrEqual(30);
});

test('leaves the page where the reader put it, and offers Jump to current', async ({ page }) => {
	await page.goto(`/calls/${ids.call}`, { waitUntil: 'networkidle' });
	await seek(page, 1).click();
	await expect(line(page, 1)).toHaveAttribute('aria-current', 'true');
	await expect(page.getByRole('button', { name: s.jumpToCurrent })).toHaveCount(0);

	await page.mouse.wheel(0, 3000);
	await expect(line(page, 1)).not.toBeInViewport();
	const scrolledTo = await page.evaluate(() => scrollY);
	await expect(line(page, 3)).toHaveAttribute('aria-current', 'true');

	expect(await page.evaluate(() => scrollY)).toBe(scrolledTo);
	const jump = page.getByRole('button', { name: s.jumpToCurrent });
	await page.screenshot({ path: 'test-results/seek-scrolled-away.png' });
	await jump.click();
	await expect(page.locator('li[aria-current]')).toBeInViewport();
	await expect(jump).toHaveCount(0);
});
