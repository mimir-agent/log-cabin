import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RecordingBar from './RecordingBar.svelte';

const call = vi.hoisted(() => ({
	/** What the call page's reload does to the bar: set by each test. */
	reloaded: () => {},
	recorder: { stop: vi.fn(async () => {}), setAudio: vi.fn() }
}));
vi.mock('$app/navigation', () => ({
	// As SvelteKit does, the page's data changes a moment after invalidate is called.
	invalidate: async () => {
		await new Promise((resolve) => setTimeout(resolve, 50));
		call.reloaded();
	}
}));
vi.mock('#lib/calls/video-recorder.js', () => ({
	CompositeRecorder: { start: async () => call.recorder }
}));

const idle = {
	active: null,
	mode: 'ask' as const,
	prompt: false,
	canRecord: true,
	canEditTranscript: true,
	title: null,
	summary: null,
	recordings: []
};
const recording = { ...idle, active: { id: 'rec-1', startedByName: 'Ada', mine: true } };

describe('RecordingBar', () => {
	it('puts Stop in the live banner for someone who can record, and no button for anyone else', async () => {
		const props = { callId: 'call-1', onerror: vi.fn() };
		const screen = render(RecordingBar, { ...props, view: recording });

		const banner = screen.getByRole('status');
		await expect.element(banner).toHaveTextContent('Recording · started by Ada');
		await expect.element(banner.getByRole('button', { name: 'Stop recording' })).toBeVisible();

		screen.rerender({ ...props, view: { ...recording, canRecord: false } });
		await expect.element(banner).toHaveTextContent('Recording · started by Ada');
		await expect.element(banner.getByRole('button')).not.toBeInTheDocument();
	});

	it('is a compact pill with Stop inside the call, and the full banner before joining', async () => {
		const props = { callId: 'call-1', onerror: vi.fn(), view: recording };
		const inCall = render(RecordingBar, { ...props, stage: document.createElement('div') });

		const pill = inCall.getByRole('status');
		await expect.element(pill).toHaveTextContent('Recording');
		await expect.element(pill).not.toHaveTextContent('started by');
		await expect.element(pill.getByRole('button', { name: 'Stop recording' })).toBeVisible();
		expect(pill.element().getBoundingClientRect().width).toBeLessThan(240);
		inCall.unmount();

		const preJoin = render(RecordingBar, props);
		await expect.element(preJoin.getByRole('status')).toHaveTextContent('started by Ada');
	});

	it('says a failed start or stop in words, never as the request and its status', async () => {
		vi.stubGlobal(
			'fetch',
			async () => new Response('{"status":500,"message":"Internal Error"}', { status: 500 })
		);
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		const onerror = vi.fn();
		const screen = render(RecordingBar, {
			callId: 'call-1',
			view: recording,
			stage: document.createElement('div'),
			onerror
		});

		await screen.getByRole('button', { name: 'Stop recording' }).click();

		await expect
			.poll(() => onerror.mock.calls[0]?.[0].message)
			.toBe('Couldn’t start or stop the recording. Try again.');
		// The reload after the failed stop finishes inside this test, not in the next one.
		await expect.element(screen.getByRole('button', { name: 'Stop recording' })).toBeEnabled();
		logged.mockRestore();
		vi.unstubAllGlobals();
	});

	it('keeps recording the video after Record, until the recording stops', async () => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', async () => Response.json({ recordingId: 'rec-1' }));
		const props = { callId: 'call-1', stage: document.createElement('div'), onerror: vi.fn() };
		const screen = render(RecordingBar, { ...props, view: idle });
		call.reloaded = () => screen.rerender({ ...props, view: recording });

		await screen.getByRole('button', { name: 'Record' }).click();
		await expect.element(screen.getByRole('status')).toHaveTextContent('Recording');
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(call.recorder.stop).not.toHaveBeenCalled();

		screen.rerender({ ...props, view: idle });
		await expect.poll(() => call.recorder.stop).toHaveBeenCalledOnce();
		expect(props.onerror).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it('stops the video when the bar goes away while the call reloads after Record', async () => {
		vi.clearAllMocks();
		vi.stubGlobal('fetch', async () => Response.json({ recordingId: 'rec-1' }));
		const props = { callId: 'call-1', stage: document.createElement('div'), onerror: vi.fn() };
		const screen = render(RecordingBar, { ...props, view: idle });
		call.reloaded = () => {};

		await screen.getByRole('button', { name: 'Record' }).click();
		await new Promise((resolve) => setTimeout(resolve, 10));
		screen.unmount();
		expect(call.recorder.stop).toHaveBeenCalledOnce();
		vi.unstubAllGlobals();
	});

	it('shows no record control when recording is off', async () => {
		const stage = document.createElement('div');
		const screen = render(RecordingBar, {
			callId: 'call-1',
			stage,
			onerror: vi.fn(),
			view: { ...idle, mode: 'off' }
		});

		await expect.element(screen.getByRole('button', { name: 'Record' })).not.toBeInTheDocument();
	});

	it('says it started automatically and offers no Stop when the org records every call', async () => {
		const screen = render(RecordingBar, {
			callId: 'call-1',
			onerror: vi.fn(),
			view: { ...idle, mode: 'on', active: { id: 'rec-1', startedByName: null, mine: true } }
		});

		const banner = screen.getByRole('status');
		await expect.element(banner).toHaveTextContent('Recording · started automatically');
		await expect.element(banner.getByRole('button')).not.toBeInTheDocument();
	});

	it('asks the person who started the call, and Not now leaves the Record button', async () => {
		const stage = document.createElement('div');
		const screen = render(RecordingBar, {
			callId: 'call-1',
			stage,
			onerror: vi.fn(),
			view: { ...idle, prompt: true }
		});

		await expect.element(screen.getByRole('dialog', { name: 'Record this call?' })).toBeVisible();
		await screen.getByRole('button', { name: 'Not now' }).click();
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(screen.getByRole('button', { name: 'Record' })).toBeVisible();
	});
});
