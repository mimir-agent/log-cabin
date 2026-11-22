import { describe, expect, it } from 'vitest';
import { createComment } from '#lib/server/posts/comments.js';
import { loadPost, parseBody, type BodyInput } from '#lib/server/posts/posts.js';
import { postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { load } from './+page.server';

type LoadEvent = Parameters<typeof load>[0];

const mentioning = (id: string) =>
	JSON.stringify({
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [{ type: 'resourceMention', attrs: { kind: 'post', id } }]
			}
		]
	});

describe('a post page with mentions of other posts', () => {
	it('gives each reader the titles of what they may open, from the body and from the comments', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		const bo = await w.person('Bo', 'member');
		const launch = await w.project(ada, 'Launch');
		const payroll = await w.project(ada, 'Payroll', true);
		const roadmap = await w.post(ada, launch, 'Roadmap');
		const salaries = await w.post(ada, payroll, 'Salaries');
		const plan = await w.post(ada, launch, 'Plan');
		w.sqlite.prepare('UPDATE posts SET body = ? WHERE id = ?').run(mentioning(roadmap), plan);
		await createComment(
			w.env,
			ada,
			await loadPost(w.env, ada, plan),
			parseBody(mentioning(salaries)) as BodyInput,
			null
		);

		const resourcesFor = async (who: typeof ada) => {
			const event = routeEvent(who, `/posts/${plan}`, { id: plan });
			const data = (await load(event as unknown as LoadEvent)) as {
				resources: Record<string, { title: string; url: string }>;
			};
			return data.resources;
		};

		expect(await resourcesFor(ada), 'the author reads both').toEqual({
			[`post:${roadmap}`]: { title: 'Roadmap', url: `/posts/${roadmap}` },
			[`post:${salaries}`]: { title: 'Salaries', url: `/posts/${salaries}` }
		});
		const forBo = await resourcesFor(bo);
		expect(Object.keys(forBo), 'Bo is not in Payroll, so only the body’s post').toEqual([
			`post:${roadmap}`
		]);
		expect(JSON.stringify(forBo), 'its title is nowhere in what Bo is sent').not.toContain(
			'Salaries'
		);
	});
});
