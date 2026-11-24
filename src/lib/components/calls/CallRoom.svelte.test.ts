import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { calls } from '#lib/strings/calls.js';
import CallRoom from './CallRoom.svelte';

// The room with its browser parts stood in for: the router, the call's connection, the
// camera and microphone, and the speaker watch. What's left is the room's own logic.
const steps: string[] = [];
/** Who the speaker watch listens to, each time it's told. */
const watched: string[][] = [];
const router = vi.hoisted(() => ({
	guard: null as null | ((navigation: unknown) => void),
	goto: vi.fn(async (url: URL) => void steps.push(`go ${url.pathname}`))
}));
vi.mock('$app/navigation', () => ({
	beforeNavigate: (guard: (navigation: unknown) => void) => (router.guard = guard),
	goto: router.goto
}));
vi.mock('#lib/calls/connection.js', () => ({
	trackKey: (sessionId: string, trackName: string) => `${sessionId}/${trackName}`,
	CallConnection: class {
		participantId = 'me';
		pc = { close() {} };
		constructor(
			_callId: string,
			private onTrack: (key: string, track: MediaStreamTrack) => void
		) {}
		join = async () => {};
		receive = async (tracks: { sessionId: string; trackName: string }[]) => {
			const [track] = document.createElement('canvas').captureStream().getTracks();
			for (const t of tracks) this.onTrack(`${t.sessionId}/${t.trackName}`, track);
		};
		setMedia = async () => {};
		leaveOnUnload() {}
		leave = async () => void steps.push('leave');
	}
}));
vi.mock('#lib/calls/local-media.svelte.js', () => ({
	LocalMedia: class {
		stream = document.createElement('canvas').captureStream();
		prefs = { layout: 'grid' };
		muted = $state(false);
		cameraOff = false;
		start = async () => {};
		setMuted(muted: boolean) {
			this.muted = muted;
		}
		stop() {}
		deviceId() {}
	}
}));
vi.mock('#lib/calls/speaker.js', () => ({
	SpeakerWatch: class {
		watch(sources: [string, MediaStream][]) {
			watched.push(sources.map(([id]) => id));
		}
		stop() {}
	}
}));

const me = { id: 'me', name: 'Ada', sessionId: 's', tracks: [], muted: false, cameraOff: false };
const s = calls.room;

/** Joins a call, then tries to go to another page of the app. */
async function navigateAway(navigation: { willUnload?: boolean } = {}) {
	render(CallRoom, {
		callId: 'call',
		title: 'Call',
		people: [me],
		ended: false,
		autoJoin: true,
		refresh: async () => {}
	});
	await expect.element(page.getByRole('button', { name: s.leave, exact: true })).toBeVisible();
	const cancel = vi.fn();
	const to = { url: new URL('/chat/thread', location.href) };
	router.guard!({ willUnload: false, to, cancel, ...navigation });
	return cancel;
}

describe('CallRoom, while joined', () => {
	beforeEach(() => {
		steps.length = 0;
		router.goto.mockClear();
	});

	it('asks before another page hangs up, and leaves before going there', async () => {
		const cancel = await navigateAway();

		expect(cancel).toHaveBeenCalled();
		await page.getByRole('button', { name: s.leaveAndGo }).click();

		await expect.poll(() => steps).toEqual(['leave', 'go /chat/thread']);
	});

	it('stays in the call when asked to', async () => {
		await navigateAway();

		await page.getByRole('button', { name: s.stay }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(steps).toEqual([]);
		expect(router.goto).not.toHaveBeenCalled();
	});

	it('lets the tab close or reload without asking', async () => {
		const cancel = await navigateAway({ willUnload: true });

		expect(cancel).not.toHaveBeenCalled();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});
});

// A muted microphone is silent, so the watch can keep it: dropping it would move the big tile.
describe('CallRoom, who the speaker watch listens to', () => {
	const bo = { ...me, id: 'bo', name: 'Bo', sessionId: 't', tracks: ['audio'] };

	beforeEach(() => {
		watched.length = 0;
	});

	/** Joins a call with Bo in it, and waits for Bo's microphone to arrive. */
	async function joinWithBo() {
		const room = render(CallRoom, {
			callId: 'call',
			title: 'Call',
			people: [me, bo],
			ended: false,
			autoJoin: true,
			refresh: async () => {}
		});
		await expect.poll(() => watched.at(-1)).toEqual(['me', 'bo']);
		return room;
	}

	it('keeps listening to you after you mute', async () => {
		await joinWithBo();
		const mute = page.getByRole('button', { name: s.mute, exact: true });

		await mute.click();

		await expect.element(mute).toHaveAttribute('aria-pressed', 'true');
		expect(watched.at(-1)).toEqual(['me', 'bo']);
	});

	it('keeps listening to someone else after they mute', async () => {
		const room = await joinWithBo();
		const told = watched.length;

		room.rerender({ people: [me, { ...bo, muted: true }] });

		await expect.poll(() => watched.length).toBeGreaterThan(told);
		expect(watched.at(-1)).toEqual(['me', 'bo']);
	});
});

describe('CallRoom, before joining', () => {
	const props = {
		callId: 'call',
		title: 'Call',
		people: [me],
		ended: false,
		refresh: async () => {}
	};

	it('says the call is recorded, before anyone joins', async () => {
		render(CallRoom, { ...props, recorded: true });

		await expect.element(page.getByText(calls.recording.consent)).toBeVisible();
		await expect.element(page.getByRole('button', { name: s.leave })).not.toBeInTheDocument();
	});

	it('says nothing about recording when the call is not recorded', async () => {
		render(CallRoom, props);

		await expect.element(page.getByText(calls.recording.consent)).not.toBeInTheDocument();
	});
});
