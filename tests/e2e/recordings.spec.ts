// Call recording, end to end: the built Worker under `wrangler dev`, real browsers, local R2.
// No SFU runs here, so the test stands in for it: it connects to a recording's sink with the
// URL the Worker would hand the SFU, and sends the SFU's packet format.
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { request } from 'node:http';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, devVars, people, persistTo, port, type Person } from './fixtures.ts';

const now = Date.now();
const ids = {
	project: '01E2ERECPR0JECT00000000000',
	call: '01E2ERECCA11000000000000000',
	participant: '01E2ERECPART1C1PANT0000000',
	recording: '01E2ERECREC0RD1NG000000000',
	track: '01E2ERECTRACK0000000000000'
};

function d1(sql: string): Record<string, unknown>[] {
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
			sql
		],
		{ encoding: 'utf8' }
	);
	return JSON.parse(out)[0].results;
}

/** The token the Worker puts in this recording's sink URLs (recordings.ts, sinkToken). */
const token = createHmac('sha256', `recording sink:${devVars.SESSION_SECRET}`)
	.update(ids.recording)
	.digest('base64url');
const sinkPath = (withToken: string) =>
	`/calls/${ids.call}/rec-sink?track=${ids.track}&token=${withToken}`;

/** A live call in a public project with a recording running, and Bo's microphone in it. */
test.beforeAll(() => {
	d1(
		[
			`INSERT INTO projects (id, name, created_by, created_at) VALUES ('${ids.project}', 'Camp', '${people.ada.id}', ${now})`,
			`INSERT INTO calls (id, project_id, started_by, started_at) VALUES ('${ids.call}', '${ids.project}', '${people.ada.id}', ${now})`,
			// Bo's row has left already, so loading the call never takes anyone out of it.
			`INSERT INTO call_participants (id, call_id, user_id, session_id, tracks, joined_at, left_at) VALUES ('${ids.participant}', '${ids.call}', '${people.bo.id}', 'sfu-bo', '["audio"]', ${now}, ${now})`,
			`INSERT INTO call_recordings (id, call_id, started_by, started_at) VALUES ('${ids.recording}', '${ids.call}', '${people.ada.id}', ${now})`,
			`INSERT INTO call_recording_tracks (id, recording_id, participant_id, opened_at) VALUES ('${ids.track}', '${ids.recording}', '${ids.participant}', ${now})`
		].join(';\n')
	);
});

async function open(browser: Browser, who: Person): Promise<Page> {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/calls/${ids.call}`);
	return page;
}

/** Status of a WebSocket upgrade to `path`: 101 when it opens. */
function upgrade(path: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const req = request({
			host: 'localhost',
			port,
			path,
			headers: {
				connection: 'Upgrade',
				upgrade: 'websocket',
				'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
				'sec-websocket-version': '13'
			}
		});
		req.on('upgrade', (_res, socket) => {
			socket.destroy();
			resolve(101);
		});
		req.on('response', (res) => {
			res.resume();
			resolve(res.statusCode ?? 0);
		});
		req.on('error', reject);
		req.end();
	});
}

const varint = (value: number) => {
	const out: number[] = [];
	for (; value >= 0x80; value = Math.floor(value / 0x80)) out.push((value % 0x80) | 0x80);
	return [...out, value];
};

/** One SFU packet: 20 ms of a 440 Hz tone as 48 kHz stereo PCM. */
function packet(seq: number): Uint8Array {
	const pcm = Buffer.alloc(960 * 4);
	for (let i = 0; i < 960; i++) {
		const sample = Math.round(8000 * Math.sin((2 * Math.PI * 440 * (seq * 960 + i)) / 48_000));
		pcm.writeInt16LE(sample, i * 4);
		pcm.writeInt16LE(sample, i * 4 + 2);
	}
	return new Uint8Array([
		0x08,
		...varint(seq),
		0x10,
		...varint(seq * 960),
		0x2a,
		...varint(pcm.length),
		...pcm
	]);
}

test.describe.configure({ mode: 'serial' });

test('everyone on the call page sees that the call is being recorded', async ({ browser }) => {
	const ada = await open(browser, 'ada');
	const bo = await open(browser, 'bo');

	for (const page of [ada, bo]) {
		await expect(
			page.getByRole('status').filter({ hasText: 'Recording · started by Ada' })
		).toBeVisible();
	}
	// Bo can post in the project, so Bo may stop it too.
	await expect(bo.getByRole('button', { name: 'Stop recording' })).toBeVisible();
});

test("the sink refuses a wrong token, and stores the SFU's audio as 16 kHz WAV the call page serves", async ({
	browser
}) => {
	expect(await upgrade(sinkPath('A'.repeat(43)))).toBe(403);

	const socket = new WebSocket(`ws://localhost:${port}${sinkPath(token)}`);
	await new Promise((resolve, reject) => {
		socket.onopen = resolve;
		socket.onerror = () => reject(new Error('the sink socket did not open'));
	});
	for (let seq = 0; seq < 100; seq++) socket.send(packet(seq));
	socket.close();

	await expect
		.poll(
			() =>
				d1(`SELECT id, duration_ms FROM call_recording_segments WHERE track_id = '${ids.track}'`),
			{
				timeout: 15_000
			}
		)
		.toEqual([{ id: expect.any(String), duration_ms: 2_000 }]);
	const [segment] = d1(`SELECT id FROM call_recording_segments WHERE track_id = '${ids.track}'`);
	const ada = await open(browser, 'ada');
	const wav = await ada.request.get(
		`/calls/${ids.call}/recordings/${ids.recording}/audio/${segment.id}`
	);
	const body = await wav.body();
	expect(wav.headers()['content-type']).toBe('audio/wav');
	expect(body.subarray(0, 4).toString()).toBe('RIFF');
	expect(body.readUInt32LE(24)).toBe(16_000);
	expect(body.length).toBe(44 + 2 * 16_000 * 2);
});

test("the recording browser's video uploads in parts and plays back on the call page", async ({
	browser
}) => {
	const ada = await open(browser, 'ada');
	const bo = await open(browser, 'bo');
	const video = `/calls/${ids.call}/recordings/${ids.recording}/video`;

	// A WebM from this browser's MediaRecorder, split into two parts as the recorder sends them.
	const statuses = await ada.evaluate(async (url) => {
		const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 240 });
		const context = canvas.getContext('2d')!;
		const recorder = new MediaRecorder(canvas.captureStream(15), { mimeType: 'video/webm' });
		const chunks: Blob[] = [];
		recorder.ondataavailable = (event) => chunks.push(event.data);
		let frame = 0;
		const timer = setInterval(() => {
			context.fillStyle = `hsl(${(frame += 10) % 360} 80% 50%)`;
			context.fillRect(0, 0, 320, 240);
		}, 50);
		recorder.start();
		await new Promise((resolve) => setTimeout(resolve, 2_000));
		await new Promise((resolve) => ((recorder.onstop = resolve), recorder.stop()));
		clearInterval(timer);
		const webm = new Blob(chunks, { type: 'video/webm' });
		const send = async (method: string, path: string, body: BodyInit) =>
			(await fetch(path, { method, body })).status;
		return [
			await send('POST', url, JSON.stringify({ op: 'start' })),
			await send('PUT', `${url}?part=1`, webm),
			await send('POST', url, JSON.stringify({ op: 'complete' }))
		];
	}, video);
	const notRecorder = await bo.request.put(`${video}?part=2`, { data: 'x' });

	expect(statuses).toEqual([200, 200, 200]);
	expect(notRecorder.status()).toBe(403);

	const stopped = await ada.request.post(`/calls/${ids.call}/recordings`, { data: { op: 'stop' } });
	expect(stopped.status()).toBe(200);
	await bo.goto(`/calls/${ids.call}`);
	await expect(bo.getByRole('status').filter({ hasText: 'Recording ·' })).toHaveCount(0);
	const player = bo.locator(`video[src="${video}"]`);
	const played = await player.evaluate(async (element: HTMLVideoElement) => {
		element.muted = true;
		await element.play();
		await new Promise((resolve) => setTimeout(resolve, 500));
		return { width: element.videoWidth, time: element.currentTime };
	});
	expect(played.width).toBe(320);
	expect(played.time).toBeGreaterThan(0);

	// Bo's two seconds, mixed in this browser at their place in the recording, and played.
	const [{ start_ms }] = d1(
		`SELECT start_ms FROM call_recording_segments WHERE track_id = '${ids.track}'`
	);
	await bo.getByRole('button', { name: 'Load audio' }).click();
	const audio = bo.locator('audio[src^="blob:"]');
	await expect(audio).toHaveCount(1);
	const duration = await audio.evaluate(
		(element: HTMLAudioElement) =>
			new Promise<number>((resolve) => {
				if (element.readyState > 0) resolve(element.duration);
				element.onloadedmetadata = () => resolve(element.duration);
			})
	);
	expect(duration).toBeCloseTo((start_ms as number) / 1000 + 2, 1);
});
