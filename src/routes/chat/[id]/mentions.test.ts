import { describe, expect, it, vi } from 'vitest';
import { chatWorld } from '#lib/server/testing/chat-world.js';
import { doc, routeEvent } from '#lib/server/testing/posts-world.js';
import { sendMessage } from '#lib/server/chat/messages.js';
import { loadThread } from '#lib/server/chat/threads.js';
import { startConversation } from '#lib/server/chat/start.js';
import { createPost, parseBody, type BodyInput } from '#lib/server/posts/posts.js';
import { createProject } from '#lib/server/posts/projects.js';
import { resourceTitles } from '#lib/server/search/resources.js';
import { load } from './+page.server';

vi.mock('#lib/server/search/resources.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('#lib/server/search/resources.js')>();
	return { ...actual, resourceTitles: vi.fn(actual.resourceTitles) };
});

const mentioning = (id: string) => {
	const mention = { type: 'resourceMention', attrs: { kind: 'post', id } };
	const body = {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'See ' }, mention] }]
	};
	return { body: JSON.stringify(body), bodyText: 'See ' };
};

describe('a thread with mentions of posts', () => {
	it('resolves every message’s mentions in one lookup, and each reader sees only the titles they may open', async () => {
		const { env, person, shareProject } = await chatWorld();
		await env.DB.prepare("INSERT INTO org (id, name, created_at) VALUES (1, 'Log Cabin', 0)").run();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const cy = await person('Cy', 'member');
		const post = async (projectId: string, title: string) =>
			createPost(env, ada, projectId, { title, ...(parseBody(doc(title)) as BodyInput) });
		const payroll = await post(await shareProject(ada, bo), 'Salaries');
		const roadmap = await post(
			await createProject(env, ada, { name: 'Launch', description: '', private: false }),
			'Roadmap'
		);
		const id = await startConversation(env, ada, {
			title: 'Plans',
			memberIds: [bo.user.id, cy.user.id],
			body: null,
			files: []
		});
		const send = async (input: ReturnType<typeof mentioning>) =>
			sendMessage(env, ada, await loadThread(env, ada, id), input, null);
		await send(mentioning(roadmap));
		const resourcesFor = async (who: typeof ada) => {
			vi.mocked(resourceTitles).mockClear();
			const data = (await load(routeEvent(who, `/chat/${id}`, { id }) as never)) as {
				resources: Record<string, { title: string; url: string }>;
			};
			expect(resourceTitles, 'one lookup for the whole thread').toHaveBeenCalledTimes(1);
			return data.resources;
		};

		expect(Object.keys(await resourcesFor(cy)), 'before Salaries is mentioned').toEqual([
			`post:${roadmap}`
		]);

		// The hub only tells open threads that a message came; each reader's load then brings it.
		await send(mentioning(payroll));

		expect(await resourcesFor(bo), 'Bo is in the Shared project').toEqual({
			[`post:${roadmap}`]: { title: 'Roadmap', url: `/posts/${roadmap}` },
			[`post:${payroll}`]: { title: 'Salaries', url: `/posts/${payroll}` }
		});
		const forCy = await resourcesFor(cy);
		expect(Object.keys(forCy), 'Cy is not, so only the Roadmap').toEqual([`post:${roadmap}`]);
		expect(JSON.stringify(forCy), 'its title is nowhere in what Cy is sent').not.toContain(
			'Salaries'
		);
	});
});
