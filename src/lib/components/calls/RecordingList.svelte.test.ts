import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RecordingList from './RecordingList.svelte';

// Tokyo is neither the test browser's zone nor the server's, so only the reader's zone gives this time.
vi.mock('$app/state', () => ({ page: { data: { timeZone: 'Asia/Tokyo' } } }));

describe('RecordingList', () => {
	it("writes when each recording started in the reader's time zone", async () => {
		const recording = {
			id: 'rec-1',
			status: 'ready' as const,
			startedAt: Date.UTC(2026, 10, 19, 3, 58),
			video: false,
			segments: [],
			lines: []
		};

		const screen = render(RecordingList, {
			callId: 'call-1',
			view: { recordings: [recording] }
		});

		await expect
			.element(screen.getByRole('heading', { name: 'Recording from Nov 19, 2026, 12:58 PM' }))
			.toBeVisible();
	});

	it('ends Mixing the audio in a failed state with Try again when a segment never arrives', async () => {
		// A fetch that never answers, until the load's own timeout (shortened here) aborts it.
		vi.stubGlobal(
			'fetch',
			(_url: string, init: RequestInit) =>
				new Promise((_resolve, reject) =>
					init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
				)
		);
		vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
			const controller = new AbortController();
			setTimeout(() => controller.abort('timed out'), 50);
			return controller.signal;
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const recording = {
			id: 'rec-1',
			status: 'ready' as const,
			startedAt: Date.UTC(2026, 10, 19, 3, 58),
			video: false,
			segments: [{ id: 'seg-1', startMs: 0 }],
			lines: []
		};
		const screen = render(RecordingList, { callId: 'call-1', view: { recordings: [recording] } });

		await screen.getByRole('button', { name: 'Load audio' }).click();

		await expect.element(screen.getByRole('alert')).toHaveTextContent('Couldn’t load');
		await expect.element(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});
});
