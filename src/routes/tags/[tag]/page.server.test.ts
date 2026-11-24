import { describe, expect, it } from 'vitest';
import { doc, postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { loadPost, updatePost, validatePostInput } from '#lib/server/posts/posts.js';
import { renameTag } from '#lib/server/posts/tags.js';
import { createVersion } from '#lib/server/posts/versions.js';
import { load } from './+page.server';

type LoadEvent = Parameters<typeof load>[0];
type TagData = Exclude<Awaited<ReturnType<typeof load>>, void>;

async function tagPage(who: Parameters<typeof routeEvent>[0], tag: string) {
	const event = routeEvent(who, `/tags/${tag}`, { tag }) as unknown as LoadEvent;
	return (await load(event)) as TagData;
}

describe('/tags/[tag]', () => {
	it('lists the posts tagged in projects each person can see, leaving out the rest for a guest', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		const gus = await w.person('Gus', 'guest');
		const open = await w.project(ada, 'Field test');
		const hidden = await w.project(ada, 'Budget', true);
		const shared = await w.project(ada, 'Tents');
		await w.addTo(ada, shared, gus);
		await w.post(ada, open, 'Open plan', 'Kickoff for the #Launch week');
		await w.post(ada, hidden, 'Private plan', 'Money for the #launch');
		await w.post(ada, shared, 'Guest plan', 'Pitch tents #launch #tents');
		await w.post(ada, shared, 'Untagged', 'Nothing about launch here, see issue #42');

		const titles = (data: TagData) => data.items.map((p: { title: string }) => p.title).sort();
		expect(titles(await tagPage(ada, 'launch'))).toEqual([
			'Guest plan',
			'Open plan',
			'Private plan'
		]);
		expect(titles(await tagPage(gus, 'launch'))).toEqual(['Guest plan']);
		expect(titles(await tagPage(gus, 'LAUNCH'))).toEqual(['Guest plan']);
	});

	it('moves a post between tags when its body is edited', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		const projectId = await w.project(ada, 'Field test');
		const postId = await w.post(ada, projectId, 'Plan', 'Draft #wip');
		const edited = validatePostInput({ title: 'Plan', body: doc('Done #shipped') });
		if (!edited.ok) throw new Error(`expected a valid edit, got "${edited.message}"`);
		await updatePost(w.env, ada, await loadPost(w.env, ada, postId), edited.input);

		expect((await tagPage(ada, 'wip')).items).toEqual([]);
		expect((await tagPage(ada, 'shipped')).items.map((p: { id: string }) => p.id)).toEqual([
			postId
		]);
	});

	it('lists a post with versions once, as its latest version', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		const projectId = await w.project(ada, 'Field test');
		const first = await w.post(ada, projectId, 'Plan', 'Kickoff #launch');
		const second = await createVersion(w.env, ada, await loadPost(w.env, ada, first));

		expect((await tagPage(ada, 'launch')).items.map((p: { id: string }) => p.id)).toEqual([second]);
	});

	it('refuses a post with more than ten tags', () => {
		const tags = Array.from({ length: 11 }, (_, i) => `#tag${i}`).join(' ');
		const result = validatePostInput({ title: 'Plan', body: doc(tags) });
		expect(result).toMatchObject({ ok: false, message: expect.stringContaining('10 tags') });
	});

	it('404s a name that can’t be a tag and sends a signed-out visitor to sign in', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		for (const name of ['a b', '42', 'x']) {
			const e = await Promise.resolve(tagPage(ada, name)).catch((e: unknown) => e);
			expect(e, `/tags/${name}`).toMatchObject({ status: 404 });
		}
		const signedOut = await Promise.resolve(tagPage(null, 'launch')).catch((e: unknown) => e);
		expect(signedOut).toMatchObject({ status: 303, location: '/login?next=%2Ftags%2Flaunch' });
	});

	it('sends a renamed tag’s old address to the new one', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		const projectId = await w.project(ada, 'Field test');
		await w.post(ada, projectId, 'Plan', 'Kickoff #launch');
		await renameTag(w.env, 'launch', 'release');

		const moved = await Promise.resolve(tagPage(ada, 'launch')).catch((e: unknown) => e);
		expect(moved).toMatchObject({ status: 302, location: '/tags/release' });
		expect((await tagPage(ada, 'release')).items).toHaveLength(1);
	});
});
