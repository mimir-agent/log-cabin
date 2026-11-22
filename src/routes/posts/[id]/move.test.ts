import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { createComment } from '#lib/server/posts/comments.js';
import { loadPost, parseBody, type BodyInput } from '#lib/server/posts/posts.js';
import { readAttachment, storeAttachment } from '#lib/server/posts/attachments.js';
import { movePost } from '#lib/server/posts/moves.js';
import { setProjectArchived } from '#lib/server/posts/projects.js';
import { createVersion } from '#lib/server/posts/versions.js';
import { loadProject } from '#lib/server/posts/access.js';
import { doc, postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { actions, load } from './+page.server';
import {
	actions as projectActions,
	load as loadProjectPage
} from '../../projects/[id]/+page.server';

type ActionEvent = Parameters<typeof actions.move>[0];
type LoadEvent = Parameters<typeof load>[0];
type PostData = Exclude<Awaited<ReturnType<typeof load>>, void>;
type ProjectLoadEvent = Parameters<typeof loadProjectPage>[0];
type ProjectActionEvent = Parameters<typeof projectActions.pin>[0];

async function moveWorld() {
	const w = await postsWorld();
	const ada = await w.person('Ada', 'member');
	const bo = await w.person('Bo', 'member');
	const fieldTest = await w.project(ada, 'Field test');
	const budget = await w.project(ada, 'Budget');
	const photo = await storeAttachment(
		w.env,
		ada,
		{ projectId: fieldTest },
		new File(['png'], 'tent.png', { type: 'image/png' })
	);
	const body = JSON.stringify({
		type: 'doc',
		content: [
			{ type: 'paragraph', content: [{ type: 'text', text: 'Which tent?' }] },
			{ type: 'image', attrs: { src: `/files/attachments/${photo.id}`, alt: 'Tent' } }
		]
	});
	const postId = await w.post(ada, fieldTest, 'Tent options');
	w.sqlite.prepare('UPDATE posts SET body = ? WHERE id = ?').run(body, postId);
	await createComment(
		w.env,
		bo,
		await loadPost(w.env, bo, postId),
		parseBody(doc('The green one')) as BodyInput,
		null
	);

	const move = (who: SignedIn, projectId: string) =>
		actions.move(
			routeEvent(who, `/posts/${postId}`, { id: postId }, { projectId }) as unknown as ActionEvent
		);
	const page = async (who: SignedIn) =>
		(await load(
			routeEvent(who, `/posts/${postId}`, { id: postId }) as unknown as LoadEvent
		)) as PostData;
	const feedTitles = async (who: SignedIn, projectId: string) => {
		const event = routeEvent(who, `/projects/${projectId}`, { id: projectId });
		const data = (await loadProjectPage(event as unknown as ProjectLoadEvent)) as {
			feed: { items: { title: string }[] };
			pins: unknown[];
		};
		return { titles: data.feed.items.map((p) => p.title), pins: data.pins.length };
	};
	const pin = (who: SignedIn, projectId: string) =>
		projectActions.pin(
			routeEvent(
				who,
				`/projects/${projectId}`,
				{ id: projectId },
				{
					subjectType: 'post',
					subjectId: postId
				}
			) as unknown as ProjectActionEvent
		);
	return { ...w, ada, bo, fieldTest, budget, photo, postId, move, page, feedTitles, pin };
}

describe('moving a post on /posts/[id]', () => {
	it('moves the post with its comments and files, and shows who moved it from where', async () => {
		const w = await moveWorld();
		await w.pin(w.ada, w.fieldTest);
		expect((await w.page(w.ada)).moveTargets).toEqual([{ id: w.budget, name: 'Budget' }]);

		await w.move(w.ada, w.budget);

		const data = await w.page(w.bo);
		expect(data.post.project.name).toBe('Budget');
		expect(data.comments.map((c: { authorName: string }) => c.authorName)).toEqual(['Bo']);
		expect(data.moves).toEqual([
			{ by: 'Ada', from: 'Field test', to: 'Budget', at: expect.any(Number) }
		]);
		expect(await w.feedTitles(w.bo, w.fieldTest)).toEqual({ titles: [], pins: 0 });
		expect(await w.feedTitles(w.bo, w.budget)).toEqual({ titles: ['Tent options'], pins: 0 });

		// A guest who is only in the new project can open the post and its photo.
		const gus = await w.person('Gus', 'guest');
		await w.addTo(w.ada, w.budget, gus);
		expect((await w.page(gus)).post.title).toBe('Tent options');
		const file = await readAttachment(w.env, gus, w.photo.id);
		expect(file.row).toMatchObject({ projectId: w.budget });
	});

	it('names a project the reader can’t see as another project', async () => {
		const w = await moveWorld();
		const hidden = await w.project(w.ada, 'Payroll', true);
		const gus = await w.person('Gus', 'guest');
		await w.addTo(w.ada, w.budget, gus);
		await w.move(w.ada, hidden);
		await w.move(w.ada, w.budget);
		const lines = (await w.page(gus)).moves as { from: string | null; to: string | null }[];
		expect(lines.map((m) => [m.from, m.to])).toEqual([
			[null, null],
			[null, 'Budget']
		]);
	});

	it('moves every version of the post, so the old project can read none of them', async () => {
		const w = await moveWorld();
		const first = await loadPost(w.env, w.ada, w.postId);
		const latest = await createVersion(w.env, w.ada, first);
		await w.pin(w.ada, w.fieldTest);
		const gus = await w.person('Gus', 'guest');
		await w.addTo(w.ada, w.fieldTest, gus);

		await movePost(w.env, w.ada, await loadPost(w.env, w.ada, latest), w.budget);

		const projects = w.sqlite.prepare('SELECT id, project_id FROM posts ORDER BY version').all();
		expect(projects).toEqual([
			{ id: w.postId, project_id: w.budget },
			{ id: latest, project_id: w.budget }
		]);
		for (const id of [w.postId, latest]) {
			const e = await loadPost(w.env, gus, id).catch((e: unknown) => e);
			expect(e, `version ${id}`).toMatchObject({ status: 404 });
		}
		expect((await readAttachment(w.env, w.bo, w.photo.id)).row).toMatchObject({
			projectId: w.budget
		});
		expect((await w.page(w.bo)).comments).toHaveLength(1);
		expect(await w.feedTitles(w.ada, w.fieldTest)).toEqual({ titles: [], pins: 0 });
	});

	it('refuses anyone but the author or an admin, and projects the mover can’t post in', async () => {
		const w = await moveWorld();
		await expect(w.move(w.bo, w.budget)).rejects.toMatchObject({ status: 403 });
		expect((await w.page(w.bo)).moveTargets).toBeNull();

		const hidden = await w.project(w.bo, 'Payroll', true);
		await expect(w.move(w.ada, hidden)).rejects.toMatchObject({ status: 404 });
		await setProjectArchived(w.env, w.ada, await loadProject(w.env, w.ada, w.budget), true);
		await expect(w.move(w.ada, w.budget)).rejects.toMatchObject({ status: 403 });
		await expect(w.move(w.ada, w.fieldTest)).rejects.toMatchObject({ status: 400 });

		const admin = await w.person('Ida', 'admin');
		const open = await w.project(admin, 'Ops');
		await w.move(admin, open);
		expect((await w.page(w.ada)).post.project.name).toBe('Ops');
		expect(w.sqlite.prepare('SELECT count(*) AS n FROM post_moves').get()).toEqual({ n: 1 });
	});
});
