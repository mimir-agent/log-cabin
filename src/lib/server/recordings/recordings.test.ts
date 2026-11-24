import { describe, expect, it, vi } from 'vitest';
import {
	joinCall,
	leaveCall,
	loadCall,
	publishTracks,
	settleRecordedCalls,
	startCall,
	endCall
} from '../calls/calls';
import { callsWorld, offer, status } from '../calls/testing';
import { shareCall } from '../calls/shares';
import { createProject } from '../posts/projects';
import { updateOrg } from '../org';
import { fakeBucket } from '../testing/fake-durable-object';
import { CHECK_MODEL, SUMMARY_MODEL } from '../ai/grounded';
import { activeRecording, startRecording, stopRecording, flushGraceMs } from './recordings';
import {
	connectRecordingSink,
	nextSegmentSeq,
	saveSegment,
	sinkInitHeader,
	type SinkInit
} from './sink';
import {
	editTranscriptLine,
	finishIfTranscribed,
	recordingHandlers,
	regenerateSummary,
	revertTranscriptLine,
	summarizeCallIfDone,
	TRANSCRIBE_MODEL,
	transcribeSegment
} from './transcripts';
import { failStuckRecordings, stopOverdueRecordings, stuckAfterMs } from './health';
import { recordingsView } from './view';
import { deleteAllRecordings, removeRecordingMedia } from './remove';
import {
	completeVideo,
	recordingOfCall,
	startVideo,
	uploadVideoPart,
	videoResponse
} from './video';
import type { SignedIn } from '../auth/session';
import { POST as recordingsPost } from '../../../routes/calls/[id]/recordings/+server';
import { load as callPageLoad } from '../../../routes/calls/[id]/+page.server';

type Bullet = { text: string; cites: number[] };

/** A call with recording set up: a fake SFU, R2, Workers AI and the recording sinks. */
async function recordingWorld() {
	const { bucket, objects, uploads } = fakeBucket();
	const ai = {
		/** What Whisper hears in every segment. */
		heard: [] as { start: number; end: number; text: string }[],
		/** What Whisper answers instead, when it returns text without timed segments. */
		untimed: null as { text: string } | null,
		/** What the summary model answers, by the system prompt it was given. */
		bullets: (() => []) as (instructions: string) => Bullet[],
		/** The points the check model finds their sentences don't back; it backs every other. */
		unsupported: [] as string[],
		asked: [] as { model: string; input: Record<string, unknown> }[]
	};
	const AI = {
		run: async (model: string, input: Record<string, unknown>) => {
			ai.asked.push({ model, input });
			if (model === TRANSCRIBE_MODEL)
				return ai.untimed ?? { text: ai.heard.map((h) => h.text).join(' '), segments: ai.heard };
			const [system, user] = input.messages as { content: string }[];
			if (model === CHECK_MODEL) {
				const verdicts = [...user.content.matchAll(/^Point (\d+): (.*)$/gm)].map(([, n, text]) => ({
					point: Number(n),
					supported: !ai.unsupported.includes(text)
				}));
				return { choices: [{ message: { content: JSON.stringify({ verdicts }) } }] };
			}
			if (model === SUMMARY_MODEL) {
				const bullets = ai.bullets(system.content);
				return { choices: [{ message: { content: JSON.stringify({ bullets }) } }] };
			}
			throw new Error(`unexpected model ${model}`);
		}
	};
	const forwarded: { name: string; request: Request }[] = [];
	const RECORDING_SINK = {
		idFromName: (name: string) => name,
		get: (name: string) => ({
			fetch: async (request: Request) => {
				forwarded.push({ name, request });
				return new Response('sink');
			}
		})
	};
	const w = await callsWorld({
		APP_URL: 'https://campfire.test',
		SESSION_SECRET: 'test-session-secret',
		AI,
		BUCKET: bucket,
		RECORDING_SINK
	} as unknown as Partial<Env>);
	w.sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Log Cabin', 0)");
	const ada = await w.person('Ada', 'member');
	const bo = await w.person('Bo', 'member');
	const cy = await w.person('Cy', 'member');
	const vi = await w.person('Vi', 'viewer');
	const projectId = await createProject(w.env, ada, {
		name: 'Camp',
		description: '',
		private: false
	});
	const callId = await startCall(w.env, ada, { kind: 'project', id: projectId }, Date.now());
	const call = () => loadCall(w.env, ada, callId);
	/** Joins the call and publishes a microphone, as a browser does. */
	const speak = async (who: SignedIn) => {
		const joined = await joinCall(w.env, who, await loadCall(w.env, who, callId));
		await publishTracks(w.env, who, await loadCall(w.env, who, callId), joined.participantId, {
			sessionDescription: offer,
			tracks: [{ location: 'local', mid: '0', trackName: 'audio' }]
		});
		w.present.push(who.user.id);
		return joined;
	};
	const adapterRequests = (kind: 'new' | 'close') =>
		w.sfu.filter((r) => r.url.endsWith(`/adapters/websocket/${kind}`));
	return {
		...w,
		ai,
		objects,
		uploads,
		forwarded,
		ada,
		bo,
		cy,
		vi,
		callId,
		call,
		speak,
		adapterRequests
	};
}

type World = Awaited<ReturnType<typeof recordingWorld>>;

/** Every endpoint the SFU was given, in order. */
function endpoints(w: World): string[] {
	return w
		.adapterRequests('new')
		.flatMap((r) => (r.body as { tracks: { endpoint: string }[] }).tracks.map((t) => t.endpoint));
}

/** The SFU connecting to an endpoint it was given. */
function sfuConnects(
	w: World,
	endpoint: string,
	headers: Record<string, string> = { upgrade: 'websocket' }
) {
	return connectRecordingSink(new Request(endpoint.replace(/^wss:/, 'https:'), { headers }), w.env);
}

describe('recording a call', () => {
	it('sends each microphone to its own sink through the SFU, with the app token', async () => {
		const w = await recordingWorld();
		const adaIn = await w.speak(w.ada);
		const boIn = await w.speak(w.bo);

		await startRecording(w.env, w.ada, await w.call());

		const [request] = w.adapterRequests('new');
		expect(request).toMatchObject({
			method: 'POST',
			url: 'https://rtc.live.cloudflare.com/v1/apps/app-1/adapters/websocket/new',
			auth: 'Bearer secret-token'
		});
		const sink = new RegExp(
			`^wss://campfire\\.test/calls/${w.callId}/rec-sink\\?track=\\w+&token=[\\w-]{43}$`
		);
		expect(request.body).toEqual({
			tracks: [adaIn, boIn].map((p) => ({
				location: 'remote',
				sessionId: p.sessionId,
				trackName: 'audio',
				endpoint: expect.stringMatching(sink),
				outputCodec: 'pcm'
			}))
		});
	});

	it('gives someone who joins a recorded call an adapter, and closes it when they leave', async () => {
		const w = await recordingWorld();
		await w.speak(w.ada);
		await startRecording(w.env, w.ada, await w.call());

		const cyIn = await w.speak(w.cy);
		const [, late] = w.adapterRequests('new');
		await leaveCall(w.env, w.cy, await w.call(), cyIn.participantId);

		expect(late.body).toMatchObject({
			tracks: [{ sessionId: cyIn.sessionId, trackName: 'audio' }]
		});
		expect(w.adapterRequests('close').map((r) => r.body)).toEqual([
			{ tracks: [{ adapterId: 'adapter-2' }] }
		]);
	});

	it('stops and saves the recording when the last person leaves, and people who return start a new call', async () => {
		const w = await recordingWorld();
		const ada = await w.speak(w.ada);
		const bo = await w.speak(w.bo);
		const id = await startRecording(w.env, w.ada, await w.call());

		await leaveCall(w.env, w.ada, await w.call(), ada.participantId);
		expect(await activeRecording(w.env, w.callId)).toMatchObject({ id });
		await leaveCall(w.env, w.bo, await w.call(), bo.participantId);

		expect(await activeRecording(w.env, w.callId)).toBeUndefined();
		expect(w.jobs.map((j) => j.body)).toContainEqual(
			expect.objectContaining({
				kind: 'recording.stopped',
				recordingId: id,
				callId: w.callId
			})
		);
		expect(w.adapterRequests('close').at(-1)?.body).toEqual({
			tracks: [{ adapterId: 'adapter-2' }]
		});
		await expect(joinCall(w.env, w.ada, await w.call())).rejects.toMatchObject({ status: 410 });
		const next = await startCall(w.env, w.ada, (await w.call()).place);
		expect(next).not.toBe(w.callId);
	});

	it('stops and saves the recording when everyone has left without leaving, as when their tabs close', async () => {
		const w = await recordingWorld();
		await w.speak(w.ada);
		const id = await startRecording(w.env, w.ada, await w.call());
		w.present.length = 0;

		await settleRecordedCalls(w.env, Date.now() + 60_000);

		expect(await activeRecording(w.env, w.callId)).toBeUndefined();
		expect(w.jobs.map((j) => j.body)).toContainEqual(
			expect.objectContaining({
				kind: 'recording.stopped',
				recordingId: id,
				callId: w.callId
			})
		);
	});

	it('closes every adapter on Stop and on the end of the call, and finishes the transcript after the sinks flush', async () => {
		const w = await recordingWorld();
		await w.speak(w.ada);
		await w.speak(w.bo);
		await startRecording(w.env, w.ada, await w.call());

		await stopRecording(w.env, w.bo, await w.call());

		expect(w.adapterRequests('close').map((r) => r.body)).toEqual([
			{ tracks: [{ adapterId: 'adapter-1' }, { adapterId: 'adapter-2' }] }
		]);
		expect(w.jobs.at(-1)).toMatchObject({
			body: { kind: 'recording.stopped' },
			delaySeconds: flushGraceMs / 1000
		});

		await startRecording(w.env, w.ada, await w.call());
		await endCall(w.env, w.ada, await w.call());

		expect(w.adapterRequests('close').at(-1)?.body).toEqual({
			tracks: [{ adapterId: 'adapter-3' }, { adapterId: 'adapter-4' }]
		});
	});

	it('shows everyone the banner, and lets only people who can post in the project start or stop it', async () => {
		const w = await recordingWorld();
		await w.speak(w.ada);

		expect(await status(startRecording(w.env, w.vi, await loadCall(w.env, w.vi, w.callId)))).toBe(
			403
		);
		await startRecording(w.env, w.ada, await w.call());
		expect(await status(stopRecording(w.env, w.vi, await loadCall(w.env, w.vi, w.callId)))).toBe(
			403
		);

		const viewer = await recordingsView(w.env, w.vi, await loadCall(w.env, w.vi, w.callId));
		const member = await recordingsView(w.env, w.bo, await w.call());
		expect(viewer.active).toMatchObject({ startedByName: 'Ada', mine: false });
		expect(viewer.canRecord).toBe(false);
		expect(member.active).toMatchObject({ startedByName: 'Ada' });
		expect(member.canRecord).toBe(true);
	});
});

/**
 * The SFU answering each adapter request with `answer`, given the endpoints it was asked for.
 * Requests still reach the fake SFU first, so they are recorded and numbered.
 */
function sfuAnswersAdapters(answer: (endpoints: string[]) => Response) {
	const sfu = globalThis.fetch;
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		const response = await sfu(url, init);
		if (!url.endsWith('/adapters/websocket/new')) return response;
		const { tracks } = JSON.parse(String(init.body)) as { tracks: { endpoint: string }[] };
		return answer(tracks.map((t) => t.endpoint));
	});
}

/** Everything written to console.error while `run` runs. */
async function errorsLogged(run: () => Promise<unknown>): Promise<string> {
	const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		await run();
		return spy.mock.calls.flat().join('\n');
	} finally {
		spy.mockRestore();
	}
}

const tokenOf = (endpoint: string) => endpoint.match(/token=([\w-]+)/)![1];

describe('when the SFU refuses adapters', () => {
	it("records everyone else when one person's adapter fails, keeping the sink token out of the stored and logged error", async () => {
		const w = await recordingWorld();
		await w.speak(w.ada);
		const boIn = await w.speak(w.bo);
		let refused = '';
		sfuAnswersAdapters(([, bo]) => {
			refused = bo;
			return Response.json({
				tracks: [
					{ adapterId: 'adapter-ada' },
					{ errorCode: 'connection_failed', errorDescription: `could not connect to ${bo}` }
				]
			});
		});

		const logged = await errorsLogged(() => w.call().then((c) => startRecording(w.env, w.ada, c)));

		const bosTrack = w.sqlite
			.prepare('SELECT closed_at, error FROM call_recording_tracks WHERE participant_id = ?')
			.get(boIn.participantId) as { closed_at: number | null; error: string };
		expect(bosTrack.closed_at).not.toBeNull();
		expect(bosTrack.error).toMatch(/^connection_failed could not connect to .*token=\[redacted\]$/);
		expect(bosTrack.error).not.toContain(tokenOf(refused));
		expect(logged).toContain('token=[redacted]');
		expect(logged).not.toContain(tokenOf(refused));
		expect((await recordingsView(w.env, w.ada, await w.call())).active).not.toBeNull();
	});

	it('answers 502 and leaves no recording when the SFU is down and refuses every adapter', async () => {
		const w = await recordingWorld();
		await w.speak(w.ada);
		let asked: string[] = [];
		sfuAnswersAdapters((endpoints) => {
			asked = endpoints;
			return Response.json(
				{ errorCode: 'unavailable', errorDescription: `cannot reach ${endpoints.join(', ')}` },
				{ status: 503 }
			);
		});

		let answered: number | 'ok' = 'ok';
		const logged = await errorsLogged(async () => {
			answered = await status(startRecording(w.env, w.ada, await w.call()));
		});

		expect(answered).toBe(502);
		expect(w.sqlite.prepare('SELECT count(*) AS n FROM call_recordings').get()).toEqual({ n: 0 });
		expect(logged).toContain('token=[redacted]');
		expect(logged).not.toContain(tokenOf(asked[0]));
	});

	it('still stops the recording when the SFU fails to close its adapters, and logs which ones', async () => {
		const w = await recordingWorld();
		await w.speak(w.ada);
		await startRecording(w.env, w.ada, await w.call());
		const sfu = globalThis.fetch;
		vi.stubGlobal('fetch', async (url: string, init: RequestInit) =>
			url.endsWith('/adapters/websocket/close')
				? new Response('upstream timeout', { status: 504 })
				: sfu(url, init)
		);

		const logged = await errorsLogged(async () => stopRecording(w.env, w.ada, await w.call()));

		expect(logged).toMatch(/closing adapters adapter-1 failed: .*504/);
		expect(w.jobs.at(-1)?.body).toMatchObject({ kind: 'recording.stopped' });
		expect((await recordingsView(w.env, w.ada, await w.call())).recordings[0].status).toBe(
			'processing'
		);
	});
});

describe('the recording sink', () => {
	async function recording() {
		const w = await recordingWorld();
		await w.speak(w.ada);
		const recordingId = await startRecording(w.env, w.ada, await w.call());
		const [endpoint] = endpoints(w);
		return { w, recordingId, endpoint };
	}

	it("hands the SFU's socket to the track's sink, without the token", async () => {
		const { w, recordingId, endpoint } = await recording();
		const track = new URL(endpoint.replace(/^wss:/, 'https:')).searchParams.get('track')!;

		const response = await sfuConnects(w, endpoint);

		expect(await response.text()).toBe('sink');
		const [{ name, request }] = w.forwarded;
		expect(name).toBe(track);
		expect(request.url).not.toContain('token');
		expect(JSON.parse(request.headers.get(sinkInitHeader)!)).toMatchObject({
			recordingId,
			trackId: track
		});
	});

	it('refuses a wrong token, a token for another recording, and any token once the recording stops', async () => {
		const { w, endpoint } = await recording();
		const wrong = endpoint.replace(/token=[\w-]+/, `token=${'A'.repeat(43)}`);

		expect((await sfuConnects(w, wrong)).status).toBe(403);
		expect((await sfuConnects(w, endpoint.replace(/token=.*/, 'token='))).status).toBe(403);
		expect((await sfuConnects(w, endpoint, {})).status).toBe(426);

		await stopRecording(w.env, w.ada, await w.call());
		await startRecording(w.env, w.ada, await w.call());
		const [, next] = endpoints(w);
		const otherToken = next.match(/token=([\w-]+)/)![1];

		expect((await sfuConnects(w, endpoint)).status).toBe(403);
		expect(
			(await sfuConnects(w, endpoint.replace(/token=[\w-]+/, `token=${otherToken}`))).status
		).toBe(403);
		expect(w.forwarded).toEqual([]);
	});

	it('never sends the token to a browser', async () => {
		const { w, endpoint } = await recording();
		const token = endpoint.match(/token=([\w-]+)/)![1];
		const event = (who: SignedIn, url: string, body?: unknown) =>
			({
				params: { id: w.callId },
				locals: { user: who.user, member: who.member },
				url: new URL(url),
				depends: () => {},
				request: new Request(url, { method: 'POST', body: JSON.stringify(body) })
			}) as never;

		const page = await callPageLoad(event(w.bo, `https://campfire.test/calls/${w.callId}`));
		await stopRecording(w.env, w.ada, await w.call());
		const started = await recordingsPost(
			event(w.bo, `https://campfire.test/calls/${w.callId}/recordings`, { op: 'start' })
		);

		expect(JSON.stringify(page)).not.toContain(token);
		expect(await started.text()).not.toMatch(/token|rec-sink/);
	});
});

describe('transcripts', () => {
	/** Bo's audio recorded: one segment saved by the sink, starting 90 s into the recording. */
	async function boSpoke() {
		const w = await recordingWorld();
		await w.speak(w.ada);
		const boIn = await w.speak(w.bo);
		return { w, boIn, ...(await recordBo(w, boIn.participantId)) };
	}

	/** Starts a recording, and Bo's sink saves one segment of it, 90 s in. */
	async function recordBo(w: World, participantId: string) {
		const startedAt = Date.now();
		const recordingId = await startRecording(w.env, w.ada, await w.call(), startedAt);
		const track = w.sqlite
			.prepare('SELECT id FROM call_recording_tracks WHERE recording_id = ? AND participant_id = ?')
			.get(recordingId, participantId) as { id: string };
		const init: SinkInit = {
			recordingId,
			callId: w.callId,
			participantId,
			trackId: track.id,
			origin: startedAt
		};
		await saveSegment(w.env, init, {
			seq: 0,
			startMs: 90_000,
			samples: new Int16Array(16_000).fill(5)
		});
		const segmentJob = w.jobs.findLast((j) => j.body.kind === 'recording.segment')!;
		return { recordingId, init, segmentId: segmentJob.body.segmentId as string };
	}

	const callRow = (w: World) =>
		w.sqlite.prepare('SELECT title, summary FROM calls WHERE id = ?').get(w.callId) as {
			title: string | null;
			summary: string | null;
		};

	/** An ended call with one transcribed line, 'I will price tents.', and its summary written. */
	async function summarizedCall() {
		const { w, recordingId, segmentId } = await boSpoke();
		w.ai.bullets = () => [{ text: 'Bo will price tents', cites: [1] }];
		w.ai.heard = [{ start: 1.5, end: 3, text: 'I will price tents.' }];
		await transcribeSegment(w.env, segmentId);
		await stopRecording(w.env, w.ada, await w.call(), Date.now() - flushGraceMs);
		await finishIfTranscribed(w.env, recordingId, Date.now());
		await endCall(w.env, w.ada, await w.call());
		await summarizeCallIfDone(w.env, w.callId);
		const [line] = (await recordingsView(w.env, w.ada, await w.call())).recordings[0].lines;
		return { w, line };
	}

	it('fixes a line in place, keeps what was heard, and puts it back on request', async () => {
		const { w, line } = await summarizedCall();
		const linesOf = async () =>
			(await recordingsView(w.env, w.ada, await w.call())).recordings[0].lines;
		const searchBody = () =>
			(
				w.sqlite
					.prepare("SELECT body FROM search_index WHERE kind = 'call' AND ref_id = ?")
					.get(w.callId) as { body: string }
			).body;
		expect(line).toMatchObject({ text: 'I will price tents.', original: null });

		await editTranscriptLine(w.env, w.bo, await w.call(), line.id, '  I will price Tentsile.  ');
		await editTranscriptLine(w.env, w.bo, await w.call(), line.id, 'I will price Tentsile tents.');

		expect(await linesOf()).toEqual([
			{ ...line, text: 'I will price Tentsile tents.', original: 'I will price tents.' }
		]);
		expect(searchBody()).toContain('Tentsile');

		await revertTranscriptLine(w.env, w.bo, await w.call(), line.id);

		expect(await linesOf()).toEqual([line]);
		expect(searchBody()).not.toContain('Tentsile');
	});

	it("lets only people who may edit the call or post where it is edit its lines, and only the call's own", async () => {
		const { w, line } = await summarizedCall();
		const asViewer = await loadCall(w.env, w.vi, w.callId);
		const other = await startCall(w.env, w.ada, { kind: 'room', id: w.ada.user.id }, Date.now());

		expect(await status(editTranscriptLine(w.env, w.vi, asViewer, line.id, 'Mine now.'))).toBe(403);
		expect(await status(revertTranscriptLine(w.env, w.vi, asViewer, line.id))).toBe(403);
		expect(await status(regenerateSummary(w.env, w.vi, asViewer))).toBe(403);
		expect(await status(editTranscriptLine(w.env, w.ada, await w.call(), line.id, '  '))).toBe(400);
		expect(
			await status(
				editTranscriptLine(w.env, w.ada, await loadCall(w.env, w.ada, other), line.id, 'Elsewhere.')
			)
		).toBe(404);
		expect((await recordingsView(w.env, w.ada, await w.call())).recordings[0].lines).toEqual([
			line
		]);
		expect((await recordingsView(w.env, w.vi, asViewer)).canEditTranscript).toBe(false);
		expect((await recordingsView(w.env, w.bo, await w.call())).canEditTranscript).toBe(true);
	});

	it('lets a channel the call is shared into edit its lines only when the share allows editing', async () => {
		const { w, line } = await summarizedCall();
		const channel = await w.privateProject(w.ada, w.vi);
		const asViewer = async () => loadCall(w.env, w.vi, w.callId);

		await shareCall(w.env, w.ada, await w.call(), channel.id, 'view');
		expect(await status(editTranscriptLine(w.env, w.vi, await asViewer(), line.id, 'Nope.'))).toBe(
			403
		);
		expect((await recordingsView(w.env, w.vi, await asViewer())).canEditTranscript).toBe(false);

		await shareCall(w.env, w.ada, await w.call(), channel.id, 'edit');
		await editTranscriptLine(w.env, w.vi, await asViewer(), line.id, 'I will price Tentsile.');
		expect((await recordingsView(w.env, w.vi, await asViewer())).canEditTranscript).toBe(true);
		expect(
			(await recordingsView(w.env, w.ada, await w.call())).recordings[0].lines[0]
		).toMatchObject({ text: 'I will price Tentsile.', original: 'I will price tents.' });
	});

	it("refuses someone shown a call through a share who can't see where it began, instead of failing the page", async () => {
		const { w, line } = await summarizedCall();
		const origin = await w.privateProject(w.ada);
		const channel = await w.privateProject(w.ada, w.cy);
		const callId = await startCall(w.env, w.ada, origin, Date.now());
		await shareCall(w.env, w.ada, await loadCall(w.env, w.ada, callId), channel.id, 'view');
		await endCall(w.env, w.ada, await loadCall(w.env, w.ada, callId));
		const asCy = await loadCall(w.env, w.cy, callId);

		expect(await status(editTranscriptLine(w.env, w.cy, asCy, line.id, 'Nope.'))).toBe(403);
		expect((await recordingsView(w.env, w.cy, asCy)).canEditTranscript).toBe(false);
	});

	it('leaves the summary alone after an edit, and writes it again from the edited lines on request', async () => {
		const { w, line } = await summarizedCall();
		const before = callRow(w);
		w.ai.bullets = (system) =>
			system.includes('title')
				? [{ text: 'Bo will price Tentsile', cites: [1] }]
				: [{ text: 'Bo will price Tentsile tents', cites: [1] }];

		await editTranscriptLine(w.env, w.ada, await w.call(), line.id, 'I will price Tentsile tents.');
		expect(callRow(w)).toEqual(before);
		await summarizeCallIfDone(w.env, w.callId);
		expect(callRow(w)).toEqual(before);

		w.ai.asked.length = 0;
		await regenerateSummary(w.env, w.ada, await w.call());

		const asked = JSON.stringify(w.ai.asked.map((a) => a.input));
		expect(asked).toContain('I will price Tentsile tents.');
		const view = await recordingsView(w.env, w.ada, await w.call());
		expect(view.title).toBe('Bo will price Tentsile');
		expect(view.summary!.sections[0].summary.bullets).toEqual([
			{ text: 'Bo will price Tentsile tents', cites: [1] }
		]);

		w.ai.bullets = (system) =>
			system.includes('title') ? [] : [{ text: 'Bo will price Tentsile tents', cites: [1] }];
		await regenerateSummary(w.env, w.ada, await w.call());

		expect((await recordingsView(w.env, w.ada, await w.call())).title).toBe(
			'Bo will price Tentsile'
		);
	});

	it("numbers a restarted sink's segments after the ones its track already saved", async () => {
		const { w, init } = await boSpoke();

		expect(await nextSegmentSeq(w.env, init.trackId)).toBe(1);
		expect(await nextSegmentSeq(w.env, 'a-new-track')).toBe(0);
	});

	it('transcribes a segment once when the queue retries its job after a later step failed', async () => {
		const { w, recordingId, segmentId } = await boSpoke();
		w.ai.heard = [{ start: 1.5, end: 3, text: 'I will price tents.' }];

		await transcribeSegment(w.env, segmentId);
		await transcribeSegment(w.env, segmentId);

		expect(w.ai.asked.filter((a) => a.model === TRANSCRIBE_MODEL)).toHaveLength(1);
		expect(
			w.sqlite
				.prepare('SELECT count(*) AS n FROM call_transcript_lines WHERE recording_id = ?')
				.get(recordingId)
		).toEqual({ n: 1 });
	});

	it("writes the segment to R2 and transcribes it into Bo's lines, timed from the recording start", async () => {
		const { w, recordingId, boIn, segmentId } = await boSpoke();
		w.ai.heard = [
			{ start: 1.5, end: 3, text: ' I will price tents. ' },
			{ start: 4, end: 5.25, text: 'Gear costs next.' }
		];

		await transcribeSegment(w.env, segmentId);

		const key = `calls/${w.callId}/rec/${recordingId}/${boIn.participantId}/0.wav`;
		expect(String.fromCharCode(...w.objects.get(key)!.subarray(0, 4))).toBe('RIFF');
		const [whisper] = w.ai.asked;
		expect(whisper.model).toBe('@cf/openai/whisper-large-v3-turbo');
		expect(atob(whisper.input.audio as string).slice(0, 4)).toBe('RIFF');
		await stopRecording(w.env, w.ada, await w.call());
		const [recording] = (await recordingsView(w.env, w.ada, await w.call())).recordings;
		expect(
			recording.lines.map(({ speaker, startMs, endMs, text }) => ({
				speaker,
				startMs,
				endMs,
				text
			}))
		).toEqual([
			{ speaker: 'Bo', startMs: 91_500, endMs: 93_000, text: 'I will price tents.' },
			{ speaker: 'Bo', startMs: 94_000, endMs: 95_250, text: 'Gear costs next.' }
		]);
	});

	it('writes one line across the whole segment when Whisper answers with text and no timed segments', async () => {
		const { w, segmentId } = await boSpoke();
		w.ai.untimed = { text: ' I will price tents. Gear costs next. ' };

		await transcribeSegment(w.env, segmentId);

		await stopRecording(w.env, w.ada, await w.call());
		const [recording] = (await recordingsView(w.env, w.ada, await w.call())).recordings;
		expect(
			recording.lines.map(({ speaker, startMs, endMs, text }) => ({
				speaker,
				startMs,
				endMs,
				text
			}))
		).toEqual([
			{
				speaker: 'Bo',
				startMs: 90_000,
				endMs: 91_000,
				text: 'I will price tents. Gear costs next.'
			}
		]);
	});

	it('marks a stopped recording ready once its sinks have flushed and its segments are transcribed', async () => {
		const { w, recordingId, segmentId } = await boSpoke();
		await transcribeSegment(w.env, segmentId);
		const stoppedAt = Date.now();
		await stopRecording(w.env, w.ada, await w.call(), stoppedAt);

		await finishIfTranscribed(w.env, recordingId, stoppedAt + flushGraceMs - 1);
		expect((await recordingsView(w.env, w.ada, await w.call())).recordings[0].status).toBe(
			'processing'
		);
		await finishIfTranscribed(w.env, recordingId, stoppedAt + flushGraceMs);

		expect((await recordingsView(w.env, w.ada, await w.call())).recordings[0].status).toBe('ready');
	});

	it("titles and summarizes the call once it ends, from all its recordings' lines, keeping only bullets the lines support", async () => {
		const { w, boIn, recordingId: first, segmentId } = await boSpoke();
		w.ai.bullets = (system) =>
			system.includes('title')
				? [{ text: 'Bo will price tents', cites: [1] }]
				: [
						{ text: 'Bo will price tents', cites: [1] },
						{ text: 'Gear costs next', cites: [2] },
						{ text: 'Ada priced tents', cites: [1] }
					];
		w.ai.unsupported = ['Ada priced tents'];
		w.ai.heard = [{ start: 1.5, end: 3, text: 'I will price tents.' }];
		await transcribeSegment(w.env, segmentId);
		const firstStopped = Date.now();
		await stopRecording(w.env, w.ada, await w.call(), firstStopped);
		await finishIfTranscribed(w.env, first, firstStopped + flushGraceMs);
		await summarizeCallIfDone(w.env, w.callId);
		expect(callRow(w)).toEqual({ title: null, summary: null });

		// Recorded again, and the call ends while the second recording is still processing.
		const second = await recordBo(w, boIn.participantId);
		w.ai.heard = [{ start: 0, end: 1, text: 'Gear costs next.' }];
		await transcribeSegment(w.env, second.segmentId);
		const endedAt = Date.now();
		await endCall(w.env, w.ada, await w.call(), endedAt);
		expect(w.jobs.at(-1)?.body).toMatchObject({ kind: 'call.ended', callId: w.callId });
		await summarizeCallIfDone(w.env, w.callId);
		expect(callRow(w)).toEqual({ title: null, summary: null });
		await finishIfTranscribed(w.env, second.recordingId, endedAt + flushGraceMs);
		await summarizeCallIfDone(w.env, w.callId);

		const view = await recordingsView(w.env, w.ada, await w.call());
		// The view lists the newest recording first; the summary reads them in the order they ran.
		const [secondLine, firstLine] = view.recordings.map((recording) => recording.lines[0].id);
		expect(view.title).toBe('Bo will price tents');
		expect(view.summary!.sections.map((s) => s.kind)).toEqual(['summary', 'topics', 'nextSteps']);
		for (const { summary: section } of view.summary!.sections) {
			expect(section.bullets).toEqual([
				{ text: 'Bo will price tents', cites: [1] },
				{ text: 'Gear costs next', cites: [2] }
			]);
			expect(section.sources).toEqual([
				{
					id: 1,
					author: 'Bo',
					kind: '1:31',
					text: 'I will price tents.',
					lineId: firstLine,
					startMs: 91_500
				},
				{
					id: 2,
					author: 'Bo',
					kind: '1:30',
					text: 'Gear costs next.',
					lineId: secondLine,
					startMs: 90_000
				}
			]);
		}
	});

	it("summarizes a call from the end's job when its recordings were all ready before it ended", async () => {
		const { w, recordingId, segmentId } = await boSpoke();
		w.ai.bullets = () => [{ text: 'Bo will price tents', cites: [1] }];
		w.ai.heard = [{ start: 1.5, end: 3, text: 'I will price tents.' }];
		await transcribeSegment(w.env, segmentId);
		const stoppedAt = Date.now() - flushGraceMs;
		await stopRecording(w.env, w.ada, await w.call(), stoppedAt);
		await finishIfTranscribed(w.env, recordingId, Date.now());
		expect((await recordingsView(w.env, w.ada, await w.call())).recordings[0].status).toBe('ready');

		await endCall(w.env, w.ada, await w.call());
		await recordingHandlers['call.ended']!(w.env, {
			kind: 'call.ended',
			callId: w.callId,
			emittedAt: Date.now()
		});

		const view = await recordingsView(w.env, w.ada, await w.call());
		expect(view.title).toBe('Bo will price tents');
		expect(view.summary!.sections.map((s) => s.summary.bullets)).toEqual(
			Array(3).fill([{ text: 'Bo will price tents', cites: [1] }])
		);
	});

	it('titles and summarizes a call whose model writes the sentence numbers into its bullets too', async () => {
		const { w, recordingId, segmentId } = await boSpoke();
		// As Workers AI answered for a real call: every bullet was dropped for its "[1]".
		w.ai.bullets = (system) =>
			system.includes('title')
				? [{ text: 'Bo will price tents (1)', cites: [1] }]
				: [{ text: 'Bo will price tents. [1]', cites: [1] }];
		w.ai.heard = [{ start: 1.5, end: 3, text: 'I will price tents.' }];
		await transcribeSegment(w.env, segmentId);
		await stopRecording(w.env, w.ada, await w.call(), Date.now() - flushGraceMs);
		await finishIfTranscribed(w.env, recordingId, Date.now());
		await endCall(w.env, w.ada, await w.call());
		await summarizeCallIfDone(w.env, w.callId);

		const view = await recordingsView(w.env, w.ada, await w.call());
		expect(view.title).toBe('Bo will price tents');
		expect(view.summary!.sections.map((s) => s.summary.bullets)).toEqual(
			Array(3).fill([{ text: 'Bo will price tents.', cites: [1] }])
		);
	});

	it("leaves the call untitled when the model's titles say what the transcript doesn't", async () => {
		const { w, recordingId, segmentId } = await boSpoke();
		w.ai.bullets = (system) =>
			system.includes('title')
				? [{ text: 'Camping trip budget', cites: [1] }]
				: [{ text: 'Bo will price tents', cites: [1] }];
		w.ai.unsupported = ['Camping trip budget'];
		w.ai.heard = [{ start: 1.5, end: 3, text: 'I will price tents.' }];
		await transcribeSegment(w.env, segmentId);
		await stopRecording(w.env, w.ada, await w.call(), Date.now() - flushGraceMs);
		await finishIfTranscribed(w.env, recordingId, Date.now());
		await endCall(w.env, w.ada, await w.call());
		await summarizeCallIfDone(w.env, w.callId);

		const view = await recordingsView(w.env, w.ada, await w.call());
		expect(view.title).toBeNull();
		expect(view.summary!.sections.map((s) => s.summary.bullets)).toEqual(
			Array(3).fill([{ text: 'Bo will price tents', cites: [1] }])
		);
	});

	it('summarizes an ended call from what was transcribed when the hourly check fails its stuck recording', async () => {
		const { w, init, segmentId } = await boSpoke();
		w.ai.bullets = () => [{ text: 'Bo will price tents', cites: [1] }];
		w.ai.heard = [{ start: 1.5, end: 3, text: 'I will price tents.' }];
		await transcribeSegment(w.env, segmentId);
		await saveSegment(w.env, init, { seq: 1, startMs: 150_000, samples: new Int16Array(16_000) });
		const endedAt = Date.now() - stuckAfterMs - 1;
		await endCall(w.env, w.ada, await w.call(), endedAt);

		await failStuckRecordings(w.env, Date.now());

		expect(callRow(w).title).toBe('Bo will price tents');
	});

	it("summarizes an ended call from the job for its last segment, when that comes after the stop's job", async () => {
		const { w, recordingId, segmentId } = await boSpoke();
		w.ai.bullets = () => [{ text: 'Bo will price tents', cites: [1] }];
		w.ai.heard = [{ start: 1.5, end: 3, text: 'I will price tents.' }];
		await endCall(w.env, w.ada, await w.call(), Date.now() - flushGraceMs);

		await recordingHandlers['recording.segment']!(w.env, {
			kind: 'recording.segment',
			segmentId,
			recordingId,
			callId: w.callId,
			emittedAt: Date.now()
		});

		expect(callRow(w).title).toBe('Bo will price tents');
	});

	it('waits for every segment before marking the recording ready', async () => {
		const { w, recordingId } = await boSpoke();
		const stoppedAt = Date.now();
		await stopRecording(w.env, w.ada, await w.call(), stoppedAt);

		await finishIfTranscribed(w.env, recordingId, stoppedAt + flushGraceMs);

		expect((await recordingsView(w.env, w.ada, await w.call())).recordings[0].status).toBe(
			'processing'
		);
	});
});

describe('the composite video', () => {
	/** A recording by Ada whose browser has started its video upload. */
	async function uploading() {
		const w = await recordingWorld();
		await w.speak(w.ada);
		const recordingId = await startRecording(w.env, w.ada, await w.call());
		await startVideo(w.env, w.ada, w.callId, recordingId);
		const row = () => recordingOfCall(w.env, w.callId, recordingId);
		const get = async (range?: string) => {
			const headers: Record<string, string> = range ? { range } : {};
			const request = new Request('https://campfire.test/video', { headers });
			const response = await videoResponse(w.env, await row(), request);
			return {
				status: response.status,
				range: response.headers.get('content-range'),
				bytes: [...new Uint8Array(await response.arrayBuffer())]
			};
		};
		return { w, recordingId, row, get };
	}

	it('keeps no video when the recording browser completes an upload it sent nothing to', async () => {
		const { w, recordingId, row } = await uploading();
		await completeVideo(w.env, w.ada, w.callId, recordingId);

		expect((await row()).videoStatus).toBe('failed');
		expect(w.objects.size).toBe(0);
		expect(w.uploads.size).toBe(0);
		await stopRecording(w.env, w.ada, await w.call());
		const view = await recordingsView(w.env, w.bo, await w.call());
		expect(view.recordings[0].video).toBe(false);
	});

	it('completes an upload of equal parts and a smaller last one, and fails one of unequal parts as R2 does', async () => {
		const { w, recordingId, row } = await uploading();
		const part = (n: number) => new Uint8Array(n).buffer;
		await uploadVideoPart(w.env, w.ada, w.callId, recordingId, 1, part(6));
		await uploadVideoPart(w.env, w.ada, w.callId, recordingId, 2, part(8));
		await uploadVideoPart(w.env, w.ada, w.callId, recordingId, 3, part(2));

		await expect(completeVideo(w.env, w.ada, w.callId, recordingId)).rejects.toThrow(
			/expected equal part sizes/
		);
		expect((await row()).videoStatus).toBe('uploading');

		await uploadVideoPart(w.env, w.ada, w.callId, recordingId, 2, part(6));
		await completeVideo(w.env, w.ada, w.callId, recordingId);
		expect((await row()).videoStatus).toBe('ready');
	});

	it('serves the byte range a player asks for, and 416 for one past the end', async () => {
		const { w, recordingId, get } = await uploading();
		const video = Uint8Array.from({ length: 10 }, (_, i) => i);
		await uploadVideoPart(w.env, w.ada, w.callId, recordingId, 1, video.buffer);
		await completeVideo(w.env, w.ada, w.callId, recordingId);

		const all = [...video];
		expect(await get()).toEqual({ status: 200, range: null, bytes: all });
		expect(await get('bytes=0-')).toEqual({ status: 206, range: 'bytes 0-9/10', bytes: all });
		expect(await get('bytes=2-4')).toEqual({
			status: 206,
			range: 'bytes 2-4/10',
			bytes: [2, 3, 4]
		});
		expect(await get('bytes=8-100')).toMatchObject({ status: 206, range: 'bytes 8-9/10' });
		expect(await get('bytes=-3')).toMatchObject({ status: 206, range: 'bytes 7-9/10' });
		expect(await get('bytes=100-200')).toEqual({ status: 416, range: 'bytes */10', bytes: [] });

		// A video stored empty, as one was before an upload with no parts kept no video.
		w.objects.set([...w.objects.keys()][0], new Uint8Array(0));
		expect(await get('bytes=0-1023')).toEqual({ status: 416, range: 'bytes */0', bytes: [] });
	});
});

describe('the hourly health check', () => {
	const statusOf = (w: World, id: string) =>
		(
			w.sqlite.prepare('SELECT status FROM call_recordings WHERE id = ?').get(id) as {
				status: string;
			}
		).status;

	it('stops a recording once it has run four hours, closing its adapters as Stop does', async () => {
		const w = await recordingWorld();
		await w.speak(w.ada);
		const fourHours = 4 * 60 * 60_000;
		const startedAt = Date.now() - fourHours;
		const id = await startRecording(w.env, w.ada, await w.call(), startedAt);

		await stopOverdueRecordings(w.env, startedAt + fourHours - 1);
		expect(statusOf(w, id)).toBe('recording');
		await stopOverdueRecordings(w.env, startedAt + fourHours + 1);

		expect(statusOf(w, id)).toBe('processing');
		expect(w.adapterRequests('close').map((r) => r.body)).toEqual([
			{ tracks: [{ adapterId: 'adapter-1' }] }
		]);
		expect(w.jobs.at(-1)?.body).toMatchObject({ kind: 'recording.stopped', recordingId: id });
	});

	it('stops a recording whose call ended without stopping it, as when the end failed partway', async () => {
		const w = await recordingWorld();
		await w.speak(w.ada);
		const id = await startRecording(w.env, w.ada, await w.call());
		w.sqlite.prepare('UPDATE calls SET ended_at = ? WHERE id = ?').run(Date.now(), w.callId);

		await stopOverdueRecordings(w.env, Date.now());

		expect(statusOf(w, id)).toBe('processing');
	});

	it('marks a recording still processing two hours after it stopped as failed, and leaves a recent one', async () => {
		const w = await recordingWorld();
		await w.speak(w.ada);
		const now = Date.now();
		const stuck = await startRecording(w.env, w.ada, await w.call(), now - stuckAfterMs - 60_000);
		await stopRecording(w.env, w.ada, await w.call(), now - stuckAfterMs - 1);
		const recent = await startRecording(w.env, w.ada, await w.call(), now - 60_000);
		await stopRecording(w.env, w.ada, await w.call(), now - 30_000);

		await failStuckRecordings(w.env, now);

		expect(statusOf(w, stuck)).toBe('failed');
		expect(statusOf(w, recent)).toBe('processing');
	});
});

describe('removing recordings', () => {
	/** An ended call with one recording whose audio segment the sink saved and whose video is in R2. */
	async function endedWithRecording() {
		const w = await recordingWorld();
		await w.speak(w.ada);
		const boIn = await w.speak(w.bo);
		const startedAt = Date.now();
		const recordingId = await startRecording(w.env, w.ada, await w.call(), startedAt);
		const track = w.sqlite
			.prepare('SELECT id FROM call_recording_tracks WHERE recording_id = ? AND participant_id = ?')
			.get(recordingId, boIn.participantId) as { id: string };
		await saveSegment(
			w.env,
			{
				recordingId,
				callId: w.callId,
				participantId: boIn.participantId,
				trackId: track.id,
				origin: startedAt
			},
			{ seq: 0, startMs: 0, samples: new Int16Array(16_000).fill(5) }
		);
		const prefix = `calls/${w.callId}/rec/${recordingId}/`;
		w.objects.set(`${prefix}video.webm`, new Uint8Array([1]));
		await stopRecording(w.env, w.ada, await w.call(), startedAt + 1000);
		w.sqlite.prepare('UPDATE calls SET summary = ? WHERE id = ?').run('{"sections":[]}', w.callId);
		return { w, recordingId, prefix };
	}

	it('removes 2500 objects of a recording in pages of at most 1000, and nothing under another recording', async () => {
		const { w, recordingId, prefix } = await endedWithRecording();
		for (let i = 0; i < 2500; i++) w.objects.set(`${prefix}extra/${i}.wav`, new Uint8Array([1]));
		const other = `calls/${w.callId}/rec/another/0.wav`;
		w.objects.set(other, new Uint8Array([1]));

		await removeRecordingMedia(w.env, recordingId, { audio: true, video: true });

		expect([...w.objects.keys()]).toEqual([other]);
	});

	it('removes only the audio, or only the video, when asked for one', async () => {
		const { w, recordingId, prefix } = await endedWithRecording();

		await removeRecordingMedia(w.env, recordingId, { video: true });
		expect([...w.objects.keys()].map((key) => key.slice(prefix.length)).sort()).toEqual([
			expect.stringMatching(/\/0\.wav$/)
		]);

		await removeRecordingMedia(w.env, recordingId, { audio: true });
		expect(w.objects.size).toBe(0);
	});

	it("deletes a call's recordings from the page and R2, and its summary, when the person who started the call asks", async () => {
		const { w } = await endedWithRecording();
		await endCall(w.env, w.ada, await w.call());
		w.sqlite.prepare("UPDATE call_recordings SET status = 'ready'").run();

		await deleteAllRecordings(w.env, w.ada, await w.call());

		expect(w.objects.size).toBe(0);
		const recording = await recordingsView(w.env, w.ada, await w.call());
		expect(recording.recordings).toEqual([]);
		expect(recording.summary).toBeNull();
	});

	it('refuses someone who did not start the call and is not an admin, and a call still live, leaving every object', async () => {
		const { w } = await endedWithRecording();
		const before = w.objects.size;

		await expect(deleteAllRecordings(w.env, w.ada, await w.call())).rejects.toMatchObject({
			status: 409
		});
		await endCall(w.env, w.ada, await w.call());
		await expect(deleteAllRecordings(w.env, w.bo, await w.call())).rejects.toMatchObject({
			status: 403
		});
		expect(w.objects.size).toBe(before);
	});

	it('refuses while a recording is still processing, leaving its objects and rows for the queued jobs', async () => {
		const { w } = await endedWithRecording();
		await endCall(w.env, w.ada, await w.call());
		const before = w.objects.size;

		await expect(deleteAllRecordings(w.env, w.ada, await w.call())).rejects.toMatchObject({
			status: 409
		});

		expect(w.objects.size).toBe(before);
		expect((await recordingsView(w.env, w.ada, await w.call())).recordings).toHaveLength(1);
	});
});

describe('the org’s recording setting', () => {
	/** Turns recording On, then starts a new call in the project, once the world's first has ended. */
	async function callRecordedFromStart(w: World) {
		const first = await w.call();
		await endCall(w.env, w.ada, first);
		await updateOrg(w.env, { callRecording: 'on' });
		return startCall(w.env, w.ada, first.place, Date.now());
	}

	it('Ask, the default, lets a member start and stop a recording, and asks only the call’s starter', async () => {
		const w = await recordingWorld();
		await w.speak(w.ada);

		const starter = await recordingsView(w.env, w.ada, await w.call());
		const other = await recordingsView(w.env, w.bo, await w.call());
		expect(starter).toMatchObject({ mode: 'ask', prompt: true, canRecord: true });
		expect(other).toMatchObject({ mode: 'ask', prompt: false, canRecord: true });

		await startRecording(w.env, w.bo, await w.call());
		await stopRecording(w.env, w.bo, await w.call());
		const after = await recordingsView(w.env, w.ada, await w.call());
		expect(after.prompt).toBe(false);
		expect(after.recordings).toHaveLength(1);
		expect(after.recordings[0].startedByName).toBe('Bo');
	});

	it('Off refuses to start a recording, and the call page has no record control', async () => {
		const w = await recordingWorld();
		await updateOrg(w.env, { callRecording: 'off' });
		await w.speak(w.ada);

		expect(await status(startRecording(w.env, w.ada, await w.call()))).toBe(403);
		const view = await recordingsView(w.env, w.ada, await w.call());
		expect(view).toMatchObject({ mode: 'off', prompt: false, active: null });
		expect(w.adapterRequests('new')).toEqual([]);
	});

	it('On records every new call from its start, as started automatically, and nobody can stop or start it by hand', async () => {
		const w = await recordingWorld();
		const callId = await callRecordedFromStart(w);
		const loaded = () => loadCall(w.env, w.bo, callId);

		const view = await recordingsView(w.env, w.bo, await loaded());
		expect(view).toMatchObject({ mode: 'on', prompt: false });
		expect(view.active).toMatchObject({ startedByName: null });
		expect(await status(stopRecording(w.env, w.bo, await loaded()))).toBe(403);
		expect(await status(startRecording(w.env, w.bo, await loaded()))).toBe(403);

		await endCall(w.env, w.ada, await loaded());
		const [recording] = (await recordingsView(w.env, w.ada, await loaded())).recordings;
		expect(recording).toMatchObject({ startedByName: null });
	});

	it('On gives the first person to speak an adapter, because the recording is already running', async () => {
		const w = await recordingWorld();
		const callId = await callRecordedFromStart(w);
		const joined = await joinCall(w.env, w.cy, await loadCall(w.env, w.cy, callId));
		await publishTracks(w.env, w.cy, await loadCall(w.env, w.cy, callId), joined.participantId, {
			sessionDescription: offer,
			tracks: [{ location: 'local', mid: '0', trackName: 'audio' }]
		});

		expect(w.adapterRequests('new')).toHaveLength(1);
	});

	it('keeps naming who started a recording begun by hand before the setting changed to On', async () => {
		const w = await recordingWorld();
		await w.speak(w.ada);
		await startRecording(w.env, w.ada, await w.call());
		await updateOrg(w.env, { callRecording: 'on' });

		const view = await recordingsView(w.env, w.bo, await w.call());
		expect(view.active).toMatchObject({ startedByName: 'Ada' });
	});
});
