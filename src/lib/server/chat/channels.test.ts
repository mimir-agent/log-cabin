import { describe, expect, it } from 'vitest';
import { chatWorld, status, text } from '#lib/server/testing/chat-world.js';
import { loadProject } from '#lib/server/posts/access.js';
import {
	addProjectMember,
	createProject,
	joinProject,
	removeProjectMember,
	setProjectArchived,
	updateProject
} from '#lib/server/posts/projects.js';
import { search } from '#lib/server/search/search.js';
import { channelThreadId } from './channels';
import { sendMessage } from './messages';
import {
	addPeople,
	deleteThread,
	leaveThread,
	listThreads,
	loadThread,
	renameThread
} from './threads';

async function cast() {
	const w = await chatWorld();
	const ada = await w.person('Ada', 'member');
	const bo = await w.person('Bo', 'member');
	const cy = await w.person('Cy', 'member');
	const gus = await w.person('Gus', 'guest');
	return { ...w, ada, bo, cy, gus };
}

const input = { description: '', private: false, chat: true };

describe('a project made with chat format', () => {
	it('has one chat named after the project, with its creator in it', async () => {
		const { env, ada } = await cast();
		const id = await createProject(env, ada, { name: 'Trail', ...input });

		const threadId = await channelThreadId(env, ada, id);

		const thread = await loadThread(env, ada, threadId!);
		expect(thread.kind).toBe('channel');
		expect(thread.name).toBe('Trail');
		expect(thread.people.map((p) => p.name)).toEqual(['Ada']);
	});

	it('has no chat when made without chat format', async () => {
		const { env, ada } = await cast();
		const id = await createProject(env, ada, { name: 'Trail', description: '', private: false });

		expect(await channelThreadId(env, ada, id)).toBeNull();
	});

	it('is left out of everyone’s list of conversations', async () => {
		const { env, ada } = await cast();
		await createProject(env, ada, { name: 'Trail', ...input });

		expect(await listThreads(env, ada)).toEqual([]);
	});

	it('follows the project’s people: whoever joins or is added is in the chat, whoever leaves or is removed is not', async () => {
		const { env, ada, bo, cy } = await cast();
		const id = await createProject(env, ada, { name: 'Trail', ...input });
		const threadId = (await channelThreadId(env, ada, id))!;

		await joinProject(env, bo, await loadProject(env, bo, id));
		await addProjectMember(env, ada, await loadProject(env, ada, id), cy.user.id);
		expect((await loadThread(env, ada, threadId)).people.map((p) => p.name)).toEqual([
			'Ada',
			'Bo',
			'Cy'
		]);

		await removeProjectMember(env, bo, await loadProject(env, bo, id), bo.user.id);
		await removeProjectMember(env, ada, await loadProject(env, ada, id), cy.user.id);
		expect((await loadThread(env, ada, threadId)).people.map((p) => p.name)).toEqual(['Ada']);
		expect(await status(loadThread(env, bo, threadId))).toBe(404);
		expect(await status(loadThread(env, cy, threadId))).toBe(404);
	});

	it('stops a removed member’s open pages hearing the chat', async () => {
		const { env, hubCalls, ada, bo } = await cast();
		const id = await createProject(env, ada, { name: 'Trail', ...input });
		const threadId = (await channelThreadId(env, ada, id))!;
		await addProjectMember(env, ada, await loadProject(env, ada, id), bo.user.id);

		await removeProjectMember(env, ada, await loadProject(env, ada, id), bo.user.id);

		expect(hubCalls).toContainEqual({
			path: '/unsubscribe',
			body: { userId: bo.user.id, topic: `thread:${threadId}` }
		});
	});

	it('is named after the project when the project is renamed', async () => {
		const { env, ada } = await cast();
		const id = await createProject(env, ada, { name: 'Trail', ...input });
		const threadId = (await channelThreadId(env, ada, id))!;

		await updateProject(env, ada, await loadProject(env, ada, id), {
			name: 'Ridge',
			description: '',
			accessory: '',
			private: false
		});

		expect((await loadThread(env, ada, threadId)).name).toBe('Ridge');
	});

	it('says whether its project is private or archived, for the marks after its name', async () => {
		const { env, ada } = await cast();
		const id = await createProject(env, ada, { name: 'Trail', ...input, private: true });
		const threadId = (await channelThreadId(env, ada, id))!;

		const open = await loadThread(env, ada, threadId);
		expect([open.projectPrivate, open.projectArchived]).toEqual([true, false]);

		await setProjectArchived(env, ada, await loadProject(env, ada, id), true);
		expect((await loadThread(env, ada, threadId)).projectArchived).toBe(true);
	});

	it('is read only by the project’s people, in a private project too, and found by search only for them', async () => {
		const { env, ada, bo, gus } = await cast();
		const id = await createProject(env, ada, { name: 'Trail', ...input, private: true });
		const threadId = (await channelThreadId(env, ada, id))!;
		await sendMessage(
			env,
			ada,
			await loadThread(env, ada, threadId),
			text('the lantern plan'),
			null
		);

		expect(await status(loadThread(env, bo, threadId))).toBe(404);
		expect(await status(loadThread(env, gus, threadId))).toBe(404);
		expect(await search(env, ada, 'lantern', { limit: 10 })).toHaveLength(1);
		expect(await search(env, bo, 'lantern', { limit: 10 })).toHaveLength(0);

		await addProjectMember(env, ada, await loadProject(env, ada, id), gus.user.id);
		expect(await status(loadThread(env, gus, threadId))).toBe('ok');
		expect(await search(env, gus, 'lantern', { limit: 10 })).toHaveLength(1);
	});

	it('can’t be left, deleted or changed as a group can', async () => {
		const { env, ada } = await cast();
		const id = await createProject(env, ada, { name: 'Trail', ...input });
		const thread = await loadThread(env, ada, (await channelThreadId(env, ada, id))!);

		expect(await status(leaveThread(env, ada, thread))).toBe(403);
		expect(await status(deleteThread(env, ada, thread))).toBe(403);
		expect(await status(renameThread(env, ada, thread, 'Other'))).toBe(403);
		expect(await status(addPeople(env, ada, thread, ['x']))).toBe(403);
	});
});
