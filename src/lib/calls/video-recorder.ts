// The recording browser's side of a recording: the call drawn to a canvas with everyone's
// audio mixed in, recorded as WebM and uploaded to the Worker as an R2 multipart upload.
// The server records each person's audio on its own; this is the video.

/**
 * The size of every part but the last. R2 takes a multipart upload only when each part is at
 * least 5 MiB and every part but the last is the same size; completing one with parts of
 * different sizes fails with a 500.
 */
export const partBytes = 5 * 1024 * 1024;
const fps = 15;
const size = { width: 1280, height: 720 };

/** Where n tiles go on the canvas: a near-square grid, each tile its share of the frame. */
function gridCells(n: number) {
	const columns = Math.ceil(Math.sqrt(n));
	const rows = Math.ceil(n / columns);
	const w = size.width / columns;
	const h = size.height / rows;
	return Array.from({ length: n }, (_, i) => ({
		x: (i % columns) * w,
		y: Math.floor(i / columns) * h,
		w,
		h
	}));
}

export class CompositeRecorder {
	private canvas = document.createElement('canvas');
	private mix: MediaStreamAudioDestinationNode;
	private sources = new Map<MediaStream, MediaStreamAudioSourceNode>();
	private recorder: MediaRecorder;
	private timer: ReturnType<typeof setInterval>;
	private held = new Blob();
	private part = 0;
	private uploads = Promise.resolve();
	private stopped: Promise<void> | undefined;

	/**
	 * Starts the upload and the recording. `stage` holds the call's video tiles; `url` is the
	 * recording's video endpoint. Call it from the Record click: the browser lets the audio
	 * mixer run only after a click, and the recorder writes nothing while the mixer is held.
	 */
	static async start(url: string, stage: HTMLElement, onerror: (e: unknown) => void) {
		const audio = new AudioContext();
		// Without a recent click the browser keeps the mixer suspended; resume() is not waited on past a second.
		await Promise.race([audio.resume(), new Promise((wait) => setTimeout(wait, 1_000))]);
		if (audio.state !== 'running') {
			await audio.close();
			throw new Error(
				`CompositeRecorder: expected the audio mixer to run, the browser left it ${audio.state}`
			);
		}
		await send(url, 'POST', JSON.stringify({ op: 'start' }));
		return new CompositeRecorder(url, stage, audio, onerror);
	}

	private constructor(
		private url: string,
		private stage: HTMLElement,
		private audio: AudioContext,
		private onerror: (e: unknown) => void
	) {
		this.mix = audio.createMediaStreamDestination();
		Object.assign(this.canvas, size);
		const video = this.canvas.captureStream(fps).getVideoTracks();
		const stream = new MediaStream([...video, ...this.mix.stream.getAudioTracks()]);
		this.recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
		this.recorder.ondataavailable = (event) => this.hold(event.data, false);
		this.timer = setInterval(() => this.draw(), 1000 / fps);
		this.recorder.start(10_000);
	}

	/** Mixes exactly these streams' audio into the recording: everyone in the call. */
	setAudio(streams: MediaStream[]) {
		for (const [stream, node] of this.sources) {
			if (!streams.includes(stream)) {
				node.disconnect();
				this.sources.delete(stream);
			}
		}
		for (const stream of streams) {
			if (this.sources.has(stream) || stream.getAudioTracks().length === 0) continue;
			const node = this.audio.createMediaStreamSource(stream);
			node.connect(this.mix);
			this.sources.set(stream, node);
		}
	}

	/** Stops recording, uploads what's left and completes the upload. Safe to call twice. */
	stop(): Promise<void> {
		this.stopped ??= new Promise<void>((resolve) => {
			this.recorder.onstop = () => resolve();
			this.recorder.stop();
		}).then(async () => {
			clearInterval(this.timer);
			await this.audio.close();
			this.hold(new Blob(), true);
			await this.uploads;
			await send(this.url, 'POST', JSON.stringify({ op: 'complete' }));
		});
		return this.stopped;
	}

	private draw() {
		const context = this.canvas.getContext('2d')!;
		context.fillStyle = 'black';
		context.fillRect(0, 0, size.width, size.height);
		const videos = [...this.stage.querySelectorAll('video')].filter((v) => v.videoWidth > 0);
		const cells = gridCells(videos.length);
		videos.forEach((video, i) => {
			const cell = cells[i];
			const scale = Math.min(cell.w / video.videoWidth, cell.h / video.videoHeight);
			const w = video.videoWidth * scale;
			const h = video.videoHeight * scale;
			context.drawImage(video, cell.x + (cell.w - w) / 2, cell.y + (cell.h - h) / 2, w, h);
		});
	}

	/** Keeps recorded data until it makes a whole part, then queues each part's upload. */
	private hold(blob: Blob, last: boolean) {
		const { parts, rest } = cutParts(new Blob([this.held, blob], { type: 'video/webm' }), last);
		this.held = rest;
		for (const body of parts) {
			const part = ++this.part;
			this.uploads = this.uploads.then(() => send(`${this.url}?part=${part}`, 'PUT', body));
		}
		// Said at once; stop() then rejects with it and never completes an upload missing a part.
		this.uploads.catch(this.onerror);
	}
}

/**
 * Cuts the recorded bytes into parts of exactly `partBytes`. What is left over waits for more
 * data, or, once `last`, is the final part: the only one that may be smaller.
 */
export function cutParts(held: Blob, last: boolean): { parts: Blob[]; rest: Blob } {
	const parts: Blob[] = [];
	let rest = held;
	while (rest.size >= partBytes) {
		parts.push(rest.slice(0, partBytes));
		rest = rest.slice(partBytes);
	}
	if (last && rest.size > 0) {
		parts.push(rest);
		rest = new Blob();
	}
	return { parts, rest };
}

async function send(url: string, method: string, body: BodyInit) {
	const response = await fetch(url, { method, body });
	if (!response.ok) {
		throw new Error(
			`${method} ${url}: expected 200, got ${response.status} ${await response.text()}`
		);
	}
}
