import { describe, expect, it } from 'vitest';
import type { SignedIn } from '../auth/session';
import { loadProject } from '../posts/access';
import { movePost } from '../posts/moves';
import { createPost, loadPost, parseBody, type BodyInput } from '../posts/posts';
import {
	addProjectMember,
	createProject,
	setProjectArchived,
	setProjectFavorite,
	updateProject
} from '../posts/projects';
import { postWorld, textDoc } from '../testing/post-world';
import { listInbox } from './inbox';

/** Ada's public project Launch, which Bo has joined and Cy has starred; Dee is a guest outside it. */
async function projectWorld() {
	const w = await postWorld();
	const bo = await w.person('Bo');
	const cy = await w.person('Cy');
	const dee = await w.person('Dee', 'guest');
	await w.deliverJobs(); // Ada's post, before anyone follows Launch.
	const launch = () => loadProject(w.env, w.author, w.projectId);
	await addProjectMember(w.env, w.author, await launch(), bo.user.id);
	await setProjectFavorite(w.env, cy, await loadProject(w.env, cy, w.projectId), true);
	await w.deliverJobs();
	const inboxOf = async (who: SignedIn) =>
		(await listInbox(w.env, who, 'unread')).map(({ kind, title, url }) => ({
			kind,
			title,
			url
		}));
	return { ...w, bo, cy, dee, launch, inboxOf };
}

type World = Awaited<ReturnType<typeof projectWorld>>;
const rename = async (w: World, who: SignedIn, name: string) =>
	updateProject(w.env, who, await loadProject(w.env, who, w.projectId), {
		name,
		description: '',
		accessory: '',
		private: false
	});

describe('project notifications', () => {
	it('tells someone they were added to a project, and nobody when they join it themselves', async () => {
		const w = await projectWorld();
		expect(await w.inboxOf(w.bo)).toEqual([
			{ kind: 'added_to_project', title: 'Launch', url: `/projects/${w.projectId}` }
		]);

		const camp = await createProject(w.env, w.cy, { name: 'Camp', description: '', private: true });
		await addProjectMember(w.env, w.cy, await loadProject(w.env, w.cy, camp), w.cy.user.id);
		await w.deliverJobs();
		expect(await w.inboxOf(w.cy)).toEqual([]);
	});

	it('tells the project’s members and the people who starred it that it was renamed', async () => {
		const w = await projectWorld();
		await w.sqlite.prepare('UPDATE notifications SET read_at = 1').run();
		expect(await rename(w, w.author, '  Lift-off ')).toEqual({ ok: true });
		await w.deliverJobs();

		const renamed = { kind: 'project_renamed', title: 'Lift-off', url: `/projects/${w.projectId}` };
		expect(await w.inboxOf(w.bo)).toEqual([renamed]);
		expect(await w.inboxOf(w.cy)).toEqual([renamed]);
		expect(await w.inboxOf(w.author), 'not the person who renamed it').toEqual([]);
	});

	it('refuses a rename to no name', async () => {
		const w = await projectWorld();
		expect(await rename(w, w.author, '   ')).toEqual({
			ok: false,
			message: 'Give the channel a name.'
		});
		expect((await w.launch()).name).toBe('Launch');
	});

	it('tells each member but the archiver, once, that a project is archived, and nobody when it’s unarchived', async () => {
		const w = await projectWorld();
		const eve = await w.person('Eve');
		await addProjectMember(w.env, w.author, await w.launch(), eve.user.id);
		await w.deliverJobs();
		await w.sqlite.prepare('UPDATE notifications SET read_at = 1').run();
		await setProjectArchived(w.env, w.author, await w.launch(), true);
		await w.deliverJobs();
		const archived = { kind: 'project_archived', title: 'Launch', url: `/projects/${w.projectId}` };
		expect(await w.inboxOf(w.bo)).toEqual([archived]);
		expect(await w.inboxOf(eve)).toEqual([archived]);
		expect(await w.inboxOf(w.author), 'not the person who archived it').toEqual([]);
		expect(await w.inboxOf(w.cy), 'starred it without joining').toEqual([]);

		await w.sqlite.prepare('UPDATE notifications SET read_at = 1').run();
		await setProjectArchived(w.env, w.author, await w.launch(), false);
		await w.deliverJobs();
		expect(await w.inboxOf(w.bo)).toEqual([]);
	});

	it('tells the followers of the project a post moves into, if they can see it', async () => {
		const w = await projectWorld();
		const camp = await createProject(w.env, w.bo, {
			name: 'Camp',
			description: '',
			private: false
		});
		// A guest's star outlives their access; they can't see Launch.
		await setProjectFavorite(w.env, w.dee, await w.launch(), true);
		const postId = await createPost(w.env, w.bo, camp, {
			title: 'Tents',
			...(parseBody(textDoc('Which tent?')) as BodyInput)
		});
		await w.deliverJobs();
		await w.sqlite.prepare('UPDATE notifications SET read_at = 1').run();

		await movePost(w.env, w.bo, await loadPost(w.env, w.bo, postId), w.projectId);
		await w.deliverJobs();

		const moved = { kind: 'post_moved', title: 'Tents', url: `/posts/${postId}` };
		expect(await w.inboxOf(w.author)).toEqual([moved]);
		expect(await w.inboxOf(w.cy)).toEqual([moved]);
		expect(await w.inboxOf(w.bo), 'not the person who moved it').toEqual([]);
		expect(await w.inboxOf(w.dee), 'a guest who starred Launch but can’t see it').toEqual([]);
	});

	it('tells the followers of the project a post ends up in once, when it moved on again before the first job ran', async () => {
		const w = await projectWorld();
		const camp = await createProject(w.env, w.bo, {
			name: 'Camp',
			description: '',
			private: false
		});
		await setProjectFavorite(w.env, w.author, await loadProject(w.env, w.author, camp), true);
		const postId = await createPost(w.env, w.bo, camp, {
			title: 'Tents',
			...(parseBody(textDoc('Which tent?')) as BodyInput)
		});
		await w.deliverJobs();

		await movePost(w.env, w.bo, await loadPost(w.env, w.bo, postId), w.projectId);
		// A later millisecond, so the two moves' events are told apart.
		await new Promise((resolve) => setTimeout(resolve, 2));
		await movePost(w.env, w.bo, await loadPost(w.env, w.bo, postId), camp);
		await w.deliverJobs();

		const moves = w.sqlite
			.prepare("SELECT url FROM notifications WHERE user_id = ? AND kind = 'post_moved'")
			.all(w.author.user.id);
		expect(moves, 'Ada follows Camp, where it ended up').toEqual([{ url: `/posts/${postId}` }]);
	});
});
