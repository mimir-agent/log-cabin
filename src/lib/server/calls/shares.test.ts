import { describe, expect, it } from 'vitest';
import { createGroup } from '#lib/server/chat/threads.js';
import { loadProject } from '#lib/server/posts/access.js';
import { removeProjectMember } from '#lib/server/posts/projects.js';
import { joinCall, leaveCall, loadCall, startCall } from './calls';
import { callHistory, liveCalls, placeCalls, placeSeenBy } from './history';
import { callShare, canEditCall, shareCall, unshareCall } from './shares';
import { callsWorld as world, status } from './testing';

/** Ada's call in a thread with Bo, and a private channel with Ada and Cy in it. Dee is in neither. */
async function setup() {
	const w = await world();
	const ada = await w.person('Ada', 'member');
	const bo = await w.person('Bo', 'member');
	const cy = await w.person('Cy', 'member');
	const dee = await w.person('Dee', 'member');
	const thread = await createGroup(w.env, ada, 'Standup', [bo.user.id]);
	const callId = await startCall(w.env, ada, { kind: 'thread', id: thread });
	const channel = await w.privateProject(ada, cy);
	return { ...w, ada, bo, cy, dee, callId, channel };
}

describe('sharing a call into a channel after it started', () => {
	it('lets the channel’s members see the call, and nobody else', async () => {
		const { env, ada, cy, dee, callId, channel } = await setup();
		expect(await status(loadCall(env, cy, callId))).toBe(404);

		await shareCall(env, ada, await loadCall(env, ada, callId), channel.id, 'view');

		expect(await status(loadCall(env, cy, callId))).toBe('ok');
		expect(await status(loadCall(env, dee, callId))).toBe(404);
		expect(await callShare(env, callId)).toEqual({ projectId: channel.id, permission: 'view' });
	});

	it('gives view members no say over the call, and edit members the same say as its starter’s', async () => {
		const { env, ada, cy, callId, channel } = await setup();
		await shareCall(env, ada, await loadCall(env, ada, callId), channel.id, 'view');
		expect(await canEditCall(env, cy, await loadCall(env, cy, callId))).toBe(false);
		expect(await status(unshareCall(env, cy, await loadCall(env, cy, callId)))).toBe(403);

		await shareCall(env, ada, await loadCall(env, ada, callId), channel.id, 'edit');

		expect(await canEditCall(env, cy, await loadCall(env, cy, callId))).toBe(true);
		expect(await callShare(env, callId)).toEqual({ projectId: channel.id, permission: 'edit' });
	});

	it('ends their access when the call is taken out of the channel', async () => {
		const { env, ada, cy, callId, channel } = await setup();
		await shareCall(env, ada, await loadCall(env, ada, callId), channel.id, 'edit');

		await unshareCall(env, ada, await loadCall(env, ada, callId));

		expect(await status(loadCall(env, cy, callId))).toBe(404);
		expect(await callShare(env, callId)).toBeNull();
	});

	it('is refused for someone who can’t edit the call, and into a channel the sharer can’t see', async () => {
		const { env, ada, bo, callId, channel, privateProject } = await setup();
		const secret = await privateProject(bo);
		const call = await loadCall(env, ada, callId);

		expect(await status(shareCall(env, ada, call, secret.id, 'view'))).toBe(404);
		expect(
			await status(shareCall(env, bo, await loadCall(env, bo, callId), channel.id, 'view'))
		).toBe(403);
	});
});

describe('finding a call shared into a channel', () => {
	it('lists it in the calls index and the channel’s calls, live and ended, for its members only', async () => {
		const { env, ada, cy, dee, callId, channel } = await setup();
		const place = { kind: 'project', id: channel.id } as const;
		const { participantId } = await joinCall(env, ada, await loadCall(env, ada, callId));
		await shareCall(env, ada, await loadCall(env, ada, callId), channel.id, 'view');
		const ids = async (who: typeof cy, options = {}) =>
			(await callHistory(env, who, options)).calls.map((c) => c.id);

		expect((await placeCalls(env, cy, place))?.live?.id).toBe(callId);
		expect((await liveCalls(env, cy)).map((c) => c.id)).toEqual([callId]);
		expect(await liveCalls(env, dee)).toEqual([]);

		await leaveCall(env, ada, await loadCall(env, ada, callId), participantId);

		expect(await ids(cy, { place })).toEqual([callId]);
		expect(await ids(cy)).toEqual([callId]);
		expect(await ids(dee, { place })).toEqual([]);
		expect(await ids(dee)).toEqual([]);
		expect((await placeCalls(env, cy, place))?.live).toBeNull();
	});

	it('leaves the channel’s own live call alone when it starts one', async () => {
		const { env, ada, callId, channel } = await setup();
		await shareCall(env, ada, await loadCall(env, ada, callId), channel.id, 'view');

		expect(await startCall(env, ada, { kind: 'project', id: channel.id })).not.toBe(callId);
	});
});

describe('the place a call is shown in', () => {
	it('is the channel for someone who reaches the call only through its share', async () => {
		const { env, ada, cy, callId, channel } = await setup();
		await shareCall(env, ada, await loadCall(env, ada, callId), channel.id, 'view');

		expect(await placeSeenBy(env, cy, await loadCall(env, cy, callId))).toEqual(channel);
	});

	it('stays the call’s own for someone who took part and has since left its channel', async () => {
		const { env, ada, cy, channel } = await setup();
		const own = await startCall(env, ada, channel);
		const joined = [];
		for (const who of [ada, cy]) {
			const { participantId } = await joinCall(env, who, await loadCall(env, who, own));
			joined.push({ who, participantId });
		}
		for (const { who, participantId } of joined) {
			await leaveCall(env, who, await loadCall(env, who, own), participantId);
		}
		await removeProjectMember(env, ada, await loadProject(env, ada, channel.id), cy.user.id);

		expect(await placeSeenBy(env, cy, await loadCall(env, cy, own))).toEqual(channel);
	});
});
