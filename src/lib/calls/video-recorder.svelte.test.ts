import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { CompositeRecorder, cutParts, partBytes } from './video-recorder';

afterEach(() => vi.unstubAllGlobals());

/** A call tile: a <video> showing an animated canvas, as a camera would. */
async function cameraTile(stage: HTMLElement) {
	const camera = Object.assign(document.createElement('canvas'), { width: 320, height: 240 });
	const context = camera.getContext('2d')!;
	let frame = 0;
	const timer = setInterval(() => {
		context.fillStyle = `hsl(${(frame += 10) % 360} 80% 50%)`;
		context.fillRect(0, 0, 320, 240);
	}, 50);
	const video = Object.assign(document.createElement('video'), { muted: true, playsInline: true });
	video.srcObject = camera.captureStream(15);
	stage.appendChild(video);
	await video.play();
	return () => clearInterval(timer);
}

/** A microphone: a tone as a MediaStream. */
function microphone() {
	const audio = new AudioContext();
	const tone = audio.createOscillator();
	const out = audio.createMediaStreamDestination();
	tone.connect(out);
	tone.start();
	return out.stream;
}

/** Runs `start` from a real click on a Record button, as the call page does. */
async function clickRecord<T>(start: () => Promise<T>): Promise<T> {
	const button = Object.assign(document.createElement('button'), { textContent: 'Record' });
	document.body.appendChild(button);
	const started = new Promise<T>((resolve, reject) => {
		button.onclick = () => start().then(resolve, reject);
	});
	await userEvent.click(page.getByRole('button', { name: 'Record' }));
	button.remove();
	return started;
}

describe('cutParts', () => {
	const bytes = (n: number) => new Blob([new Uint8Array(n)]);

	it('cuts parts of exactly partBytes, so R2 accepts the upload, and keeps the rest', () => {
		const { parts, rest } = cutParts(bytes(2.5 * partBytes), false);
		expect(parts.map((p) => p.size)).toEqual([partBytes, partBytes]);
		expect(rest.size).toBe(partBytes / 2);
	});

	it('waits for more data below one part', () => {
		const { parts, rest } = cutParts(bytes(partBytes - 1), false);
		expect(parts).toEqual([]);
		expect(rest.size).toBe(partBytes - 1);
	});

	it('sends what is left as the last part, however small, and nothing when nothing is', () => {
		const final = cutParts(bytes(partBytes + 3), true);
		expect(final.parts.map((p) => p.size)).toEqual([partBytes, 3]);
		expect(final.rest.size).toBe(0);
		expect(cutParts(bytes(partBytes), true).parts.map((p) => p.size)).toEqual([partBytes]);
		expect(cutParts(bytes(0), true).parts).toEqual([]);
	});
});

describe('CompositeRecorder', () => {
	it('refuses to start when the browser holds the audio mixer, as it does without a click', async () => {
		const requests: string[] = [];
		vi.stubGlobal('fetch', async (url: string) => (requests.push(url), new Response('{}')));
		// Whether this browser still holds it depends on what earlier tests clicked, so hold it here.
		vi.stubGlobal(
			'AudioContext',
			class extends AudioContext {
				get state(): AudioContextState {
					return 'suspended';
				}
				resume = () => new Promise<void>(() => {});
			}
		);

		await expect(
			CompositeRecorder.start('/calls/c1/recordings/r1/video', document.body, () => {})
		).rejects.toThrow(/expected the audio mixer to run/);
		expect(requests).toEqual([]);
	});

	it('records the call tiles with mixed audio and uploads a WebM that a player can open', async () => {
		const requests: { method: string; url: string; body: BodyInit | null | undefined }[] = [];
		vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
			requests.push({ method: init.method ?? 'GET', url, body: init.body });
			return new Response('{}');
		});
		const stage = document.createElement('div');
		document.body.appendChild(stage);
		const stopCamera = await cameraTile(stage);
		const failures: unknown[] = [];

		const recorder = await clickRecord(() =>
			CompositeRecorder.start('/calls/c1/recordings/r1/video', stage, (e) => failures.push(e))
		);
		recorder.setAudio([microphone()]);
		await new Promise((resolve) => setTimeout(resolve, 2_500));
		await recorder.stop();
		stopCamera();

		expect(failures).toEqual([]);
		expect(
			requests.map((r) => `${r.method} ${r.url} ${typeof r.body === 'string' ? r.body : ''}`)
		).toEqual([
			'POST /calls/c1/recordings/r1/video {"op":"start"}',
			'PUT /calls/c1/recordings/r1/video?part=1 ',
			'POST /calls/c1/recordings/r1/video {"op":"complete"}'
		]);
		const webm = requests[1].body as Blob;
		expect(webm.type).toBe('video/webm');
		const player = document.createElement('video');
		player.src = URL.createObjectURL(webm);
		await new Promise((resolve, reject) => {
			player.onloadedmetadata = resolve;
			player.onerror = () =>
				reject(new Error(`the recorded WebM did not load: ${player.error?.message}`));
		});
		expect([player.videoWidth, player.videoHeight]).toEqual([1280, 720]);
	});
});
