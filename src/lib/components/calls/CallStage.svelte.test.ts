import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CallStage, { type Tile } from './CallStage.svelte';

/** A live video stream, drawn on a canvas, since a test browser has no camera. */
function camera(): MediaStream {
	const canvas = document.createElement('canvas');
	canvas.getContext('2d')!.fillRect(0, 0, 4, 4);
	return canvas.captureStream();
}

const [me, ada, bo] = [camera(), camera(), camera()];
const tiles = (muted: boolean): Tile[] => [
	{ key: 'me', label: 'Me (you)', name: 'Me', stream: me, self: true },
	{ key: 'ada', label: 'Ada', name: 'Ada', stream: ada, muted },
	{ key: 'bo', label: 'Bo', name: 'Bo', stream: bo }
];

const playing = (video: HTMLVideoElement) =>
	new Promise((done) => (video.readyState >= 2 ? done(null) : (video.onloadeddata = done)));

describe('CallStage', () => {
	it('keeps each video playing when the call reloads its tiles, as it does on every mute', async () => {
		const props = { tiles: tiles(false), stage: 'ada', speaking: null, waiting: '' };
		const screen = render(CallStage, { ...props, layout: 'speaker' });
		const videos = [...screen.container.querySelectorAll('video')];
		await Promise.all(videos.map(playing));
		const reloads: string[] = [];
		for (const video of videos) {
			video.addEventListener('emptied', () =>
				reloads.push(video.parentElement!.textContent!.trim())
			);
		}

		await screen.rerender({ ...props, tiles: tiles(true) });
		await new Promise((done) => setTimeout(done, 100));

		expect([...screen.container.querySelectorAll('video')]).toEqual(videos);
		expect(reloads).toEqual([]);
	});
});
