import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { db, schema } from '#lib/server/db/index.js';
import { newId } from '#lib/server/id.js';
import { startDm } from '#lib/server/chat/threads.js';
import { loadProject } from '#lib/server/posts/access.js';
import {
	addProjectMember,
	createProject,
	removeProjectMember
} from '#lib/server/posts/projects.js';
import { joinCall, leaveCall, loadCall, startCall } from './calls';
import type { CallPlace } from './places';
import { callHistory, liveCalls, threadCalls } from './history';
import { callsWorld } from './testing';

async function world() {
	const w = await callsWorld();
	const ada = await w.person('Ada', 'member');
	const bo = await w.person('Bo', 'member');
	const cy = await w.person('Cy', 'admin');
	const gus = await w.person('Gus', 'guest');
	let clock = 1_000;
	/** Holds a call in the place with these people in it, then ends it. */
	const held = async (place: CallPlace, ...people: SignedIn[]) => {
		const at = (clock += 60_000);
		const id = await startCall(w.env, people[0], place, at);
		const joined = [];
		for (const who of people) {
			joined.push(await joinCall(w.env, who, await loadCall(w.env, who, id, at), at));
		}
		for (const [i, who] of people.entries()) {
			await leaveCall(
				w.env,
				who,
				await loadCall(w.env, who, id, at),
				joined[i].participantId,
				at + 5 * 60_000
			);
		}
		return id;
	};
	const ids = async (who: SignedIn, options: Parameters<typeof callHistory>[2] = {}) =>
		(await callHistory(w.env, who, options)).calls.map((c) => c.id);
	return { ...w, ada, bo, cy, gus, held, ids };
}

describe('the calls index', () => {
	it('lists only the past calls each person can see, newest first, guests included', async () => {
		const { env, ada, bo, cy, gus, held, ids, privateProject } = await world();
		const secret = await held(await privateProject(ada, bo), ada, bo);
		const open = {
			kind: 'project' as const,
			id: await createProject(env, ada, { name: 'Town', description: '', private: false })
		};
		const town = await held(open, ada);
		const dm = await held({ kind: 'thread', id: await startDm(env, ada, bo.user.id) }, ada, bo);
		const room = await held({ kind: 'room', id: ada.user.id }, bo);

		expect(await ids(ada)).toEqual([room, dm, town, secret]);
		expect(await ids(bo)).toEqual([room, dm, town, secret]);
		expect(await ids(cy)).toEqual([town]);
		expect(await ids(gus)).toEqual([]);
		await addProjectMember(env, ada, await loadProject(env, ada, open.id), gus.user.id);
		expect(await ids(gus)).toEqual([town]);
	});

	it('shows who was in each call, how long it lasted and where it was', async () => {
		const { ada, bo, held, privateProject, env } = await world();
		const place = await privateProject(ada, bo);
		const id = await held(place, ada, bo);

		const [call] = (await callHistory(env, bo, {})).calls;

		expect(call).toMatchObject({
			id,
			startedAt: 61_000,
			durationMs: 5 * 60_000,
			place: { kind: 'project', name: 'Ops', href: `/projects/${place.id}` },
			names: expect.arrayContaining(['Ada', 'Bo'])
		});
	});

	it('keeps a call for the people who were in it after they leave its project', async () => {
		const { env, ada, bo, held, ids, privateProject } = await world();
		const place = await privateProject(ada, bo);
		const id = await held(place, ada, bo);

		await removeProjectMember(env, bo, await loadProject(env, bo, place.id), bo.user.id);

		expect(await ids(bo)).toEqual([id]);
		expect(await loadCall(env, bo, id)).toMatchObject({ id });
	});

	it('filters to the calls this person joined', async () => {
		const { env, ada, bo, held, ids } = await world();
		const open = {
			kind: 'project' as const,
			id: await createProject(env, ada, { name: 'Town', description: '', private: false })
		};
		const withBo = await held(open, ada, bo);
		await held(open, ada);

		expect(await ids(bo, { filter: 'joined' })).toEqual([withBo]);
	});

	it('lists one project’s calls on its calls tab, a page at a time', async () => {
		const { env, ada, held, ids, privateProject } = await world();
		const ops = await privateProject(ada);
		const first = await held(ops, ada);
		const second = await held(ops, ada);
		const third = await held(ops, ada);
		await held({ kind: 'room', id: ada.user.id }, ada);

		const page = await callHistory(env, ada, { place: ops, limit: 2 });

		expect(page.calls.map((c) => c.id)).toEqual([third, second]);
		expect(await ids(ada, { place: ops, limit: 2, cursor: page.next })).toEqual([first]);
	});
});

describe('what the calls index shows of each call', () => {
	/** A recording of the call in this state; `spoke` gives it one transcript line. */
	async function record(env: Env, callId: string, status: 'processing' | 'ready', spoke: boolean) {
		const { callParticipants, callRecordings, callRecordingTracks, callRecordingSegments } = schema;
		const { callTranscriptLines } = schema;
		const participant = await db(env)
			.select()
			.from(callParticipants)
			.where(eq(callParticipants.callId, callId))
			.get();
		const [recording, track, segment] = [newId(), newId(), newId()];
		await db(env).insert(callRecordings).values({
			id: recording,
			callId,
			startedBy: participant!.userId!,
			startedAt: 1,
			status
		});
		await db(env)
			.insert(callRecordingTracks)
			.values({ id: track, recordingId: recording, participantId: participant!.id, openedAt: 1 });
		await db(env).insert(callRecordingSegments).values({
			id: segment,
			recordingId: recording,
			trackId: track,
			seq: 0,
			r2Key: 'k',
			startMs: 0,
			durationMs: 1000,
			createdAt: 1
		});
		if (spoke) {
			await db(env).insert(callTranscriptLines).values({
				id: newId(),
				recordingId: recording,
				segmentId: segment,
				startMs: 0,
				endMs: 1,
				text: 'Hi'
			});
		}
	}

	it('gives a recorded call its title, the start of its summary, and a recording and transcript mark', async () => {
		const { env, ada, held } = await world();
		const id = await held({ kind: 'room', id: ada.user.id }, ada);
		await record(env, id, 'ready', true);
		const bullet = (text: string) => ({ text, cites: [] });
		const section = (kind: string, ...texts: string[]) => ({
			kind,
			summary: { bullets: texts.map(bullet), sources: [] }
		});
		await db(env)
			.update(schema.calls)
			.set({
				title: 'Launch plan',
				summary: JSON.stringify({
					sections: [
						section('summary', 'Ship on Friday.', 'Bo owns QA.'),
						section('topics', 'Launch')
					]
				})
			})
			.where(eq(schema.calls.id, id));

		const [call] = (await callHistory(env, ada, {})).calls;

		expect(call).toMatchObject({
			title: 'Launch plan',
			preview: 'Ship on Friday. Bo owns QA.',
			recorded: true,
			transcribed: true,
			processing: false
		});
	});

	it('shows a call nobody recorded with no title, summary or marks', async () => {
		const { env, ada, held } = await world();
		await held({ kind: 'room', id: ada.user.id }, ada);

		const [call] = (await callHistory(env, ada, {})).calls;

		expect(call).toMatchObject({
			title: null,
			preview: null,
			recorded: false,
			transcribed: false,
			processing: false
		});
	});

	it('marks a call whose recording is still being written as processing', async () => {
		const { env, ada, held } = await world();
		const id = await held({ kind: 'room', id: ada.user.id }, ada);
		await record(env, id, 'processing', false);

		const [call] = (await callHistory(env, ada, {})).calls;

		expect(call).toMatchObject({ processing: true, recorded: true, transcribed: false });
	});
});

describe('the calls going on now', () => {
	it('lists the live calls this person can join, with who is in them and where', async () => {
		const { env, ada, bo, cy, gus, privateProject } = await world();
		const secret = await privateProject(ada, bo);
		const secretCall = await startCall(env, ada, secret, 10_000);
		const room = await startCall(env, bo, { kind: 'room', id: bo.user.id }, 20_000);
		await joinCall(env, bo, await loadCall(env, bo, room, 20_000), 20_000);

		const seen = (who: SignedIn) =>
			liveCalls(env, who, 30_000).then((calls) => calls.map((c) => c.id));

		expect(await seen(ada)).toEqual([room, secretCall]);
		expect(await seen(cy)).toEqual([room]);
		expect(await seen(gus)).toEqual([]);
		expect((await liveCalls(env, ada, 30_000))[0]).toEqual({
			id: room,
			startedAt: 20_000,
			names: ['Bo'],
			place: { name: 'Bo’s room', href: '/calls/room/bo' }
		});
	});

	it('leaves out a call that has ended', async () => {
		const { env, ada, held } = await world();
		await held({ kind: 'room', id: ada.user.id }, ada);

		expect(await liveCalls(env, ada)).toEqual([]);
	});
});

describe('calls in a thread’s timeline', () => {
	it('lists the thread’s ended calls since the first message shown, and the live one', async () => {
		const { env, ada, bo, held } = await world();
		const place = { kind: 'thread' as const, id: await startDm(env, ada, bo.user.id) };
		await held(place, ada, bo);
		const later = await held(place, ada, bo);
		const since = (await callHistory(env, ada, { place, limit: 1 })).calls[0].startedAt;
		const live = await startCall(env, ada, place, since + 600_000);

		const calls = await threadCalls(env, ada, place.id, since, since + 601_000);

		expect(calls?.ended.map((c) => c.id)).toEqual([later]);
		expect(calls?.ended[0]).toMatchObject({ names: ['Ada', 'Bo'], durationMs: 5 * 60_000 });
		expect(calls?.live).toMatchObject({ id: live, startedAt: since + 600_000 });
	});
});
