import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { createNote, setProjectShare } from '#lib/server/notes/notes.js';
import { loadNote } from '#lib/server/notes/access.js';
import { deletePost, loadPost, parseBody, type BodyInput } from '#lib/server/posts/posts.js';
import { pinState } from '#lib/server/posts/pins.js';
import { doc, postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { actions, load } from './+page.server';

type ActionEvent = Parameters<typeof actions.pin>[0];
type LoadEvent = Parameters<typeof load>[0];

async function pinWorld() {
	const w = await postsWorld();
	const ada = await w.person('Ada', 'member');
	const projectId = await w.project(ada, 'Field test');
	const postId = await w.post(ada, projectId, 'Packing list');
	const noteId = await createNote(w.env, ada, {
		title: 'Route',
		...(parseBody(doc('North trail')) as BodyInput)
	});
	await setProjectShare(w.env, ada, await loadNote(w.env, ada, noteId), {
		projectId,
		permission: 'view'
	});
	const callId = 'call-1';
	w.sqlite.exec(
		`INSERT INTO calls (id, project_id, started_by, started_at, ended_at)
		 VALUES ('${callId}', '${projectId}', '${ada.user.id}', 1000, 2000)`
	);

	const act = (who: SignedIn, name: 'pin' | 'unpin', type: string, id: string) =>
		actions[name](
			routeEvent(
				who,
				`/projects/${projectId}`,
				{ id: projectId },
				{
					subjectType: type,
					subjectId: id
				}
			) as unknown as ActionEvent
		);
	const pins = async (who: SignedIn) => {
		const event = routeEvent(who, `/projects/${projectId}`, { id: projectId });
		const data = (await load(event as unknown as LoadEvent)) as { pins: unknown[] };
		return data.pins.map((p) => {
			const { type, title } = p as { type: string; title: string };
			return `${type}:${title}`;
		});
	};
	return { ...w, ada, projectId, postId, noteId, callId, act, pins };
}

describe('pins on /projects/[id]', () => {
	it('shows a pinned post, note and call at the top in the order they were pinned, until unpinned', async () => {
		const w = await pinWorld();
		const bo = await w.person('Bo', 'member');
		await w.act(bo, 'pin', 'note', w.noteId);
		await w.act(w.ada, 'pin', 'post', w.postId);
		await w.act(bo, 'pin', 'call', w.callId);
		await w.act(bo, 'pin', 'note', w.noteId);
		expect(await w.pins(w.ada)).toEqual(['note:Route', 'post:Packing list', 'call:']);

		await w.act(w.ada, 'unpin', 'note', w.noteId);
		expect(await w.pins(bo)).toEqual(['post:Packing list', 'call:']);
		expect(await pinState(w.env, bo, w.projectId, { type: 'post', id: w.postId })).toEqual({
			projectId: w.projectId,
			pinned: true
		});
	});

	it('refuses a viewer, and anything that isn’t in the project', async () => {
		const w = await pinWorld();
		const vic = await w.person('Vic', 'viewer');
		const viewer = await Promise.resolve(w.act(vic, 'pin', 'post', w.postId)).catch((e) => e);
		expect(viewer).toMatchObject({ status: 403 });
		expect(await pinState(w.env, vic, w.projectId, { type: 'post', id: w.postId })).toBeNull();

		const elsewhere = await w.project(w.ada, 'Budget');
		const otherPost = await w.post(w.ada, elsewhere, 'Costs');
		const notHere = await Promise.resolve(w.act(w.ada, 'pin', 'post', otherPost)).catch((e) => e);
		expect(notHere).toMatchObject({ status: 404 });
		const kind = await Promise.resolve(w.act(w.ada, 'pin', 'project', w.projectId)).catch((e) => e);
		expect(kind).toMatchObject({ status: 400 });
		expect(await w.pins(w.ada)).toEqual([]);
	});

	it('drops a pin when its note stops being shared with the project or its post is deleted', async () => {
		const w = await pinWorld();
		await w.act(w.ada, 'pin', 'note', w.noteId);
		await w.act(w.ada, 'pin', 'post', w.postId);
		const bo = await w.person('Bo', 'member');
		await setProjectShare(w.env, w.ada, await loadNote(w.env, w.ada, w.noteId), null);
		expect(await w.pins(bo)).toEqual(['post:Packing list']);
		expect(await w.pins(w.ada)).toEqual(['post:Packing list']);

		await deletePost(w.env, w.ada, await loadPost(w.env, w.ada, w.postId));
		expect(await w.pins(w.ada)).toEqual([]);
		expect(w.sqlite.prepare('SELECT subject_type FROM project_pins').all()).toEqual([
			{ subject_type: 'note' }
		]);
	});
});
