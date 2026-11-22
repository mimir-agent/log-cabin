import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { doc, postsWorld } from '../testing/posts-world.js';
import { loadPost, updatePost, validatePostInput } from './posts.js';
import { createTag, deleteTag, listTags, renameTag, resolveTagName } from './tags.js';

describe('tags', () => {
	it('lists every tag with its post count, counting only posts this person can see', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		const gus = await w.person('Gus', 'guest');
		const open = await w.project(ada, 'Field test');
		const hidden = await w.project(ada, 'Budget', true);
		await w.post(ada, open, 'One', 'Kickoff #launch');
		await w.post(ada, hidden, 'Two', 'Money #launch #budget');
		await createTag(w.env, 'empty-tag');

		expect(await listTags(w.env, ada)).toEqual([
			{ id: expect.any(String), name: 'budget', postCount: 1 },
			{ id: expect.any(String), name: 'empty-tag', postCount: 0 },
			{ id: expect.any(String), name: 'launch', postCount: 2 }
		]);
		const forGus = await listTags(w.env, gus);
		expect(forGus.find((t) => t.name === 'launch')?.postCount).toBe(0);
	});

	it('creates a tag once, lowercased, and refuses a name that is taken or not a tag name', async () => {
		const w = await postsWorld();
		expect(await createTag(w.env, 'Launch')).toMatchObject({ ok: true, tag: { name: 'launch' } });
		expect(await createTag(w.env, 'launch')).toMatchObject({
			ok: false,
			message: 'A tag with that name already exists.'
		});
		expect(await createTag(w.env, 'a b')).toMatchObject({ ok: false });
		expect(await createTag(w.env, '42')).toMatchObject({ ok: false });
	});

	it('renames a tag: its posts follow, the old name finds the new tag, and the body text stays', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		const projectId = await w.project(ada, 'Field test');
		const postId = await w.post(ada, projectId, 'Plan', 'Kickoff #launch');

		expect(await renameTag(w.env, 'launch', 'Release')).toMatchObject({ ok: true });

		expect((await listTags(w.env, ada)).map((t) => [t.name, t.postCount])).toEqual([
			['release', 1]
		]);
		expect(await resolveTagName(w.env, 'launch')).toBe('release');
		expect(await resolveTagName(w.env, 'release')).toBe('release');
		expect((await loadPost(w.env, ada, postId)).bodyText).toBe('Kickoff #launch');

		// Saving the post again, still written #launch, keeps it on the renamed tag.
		const edited = validatePostInput({ title: 'Plan', body: doc('Kickoff again #launch') });
		if (!edited.ok) throw new Error(`expected a valid edit, got "${edited.message}"`);
		await updatePost(w.env, ada, await loadPost(w.env, ada, postId), edited.input);
		expect((await listTags(w.env, ada)).map((t) => [t.name, t.postCount])).toEqual([
			['release', 1]
		]);
	});

	it('refuses a rename to a name already in use and a rename of a tag that is not there', async () => {
		const w = await postsWorld();
		await createTag(w.env, 'one');
		await createTag(w.env, 'two');
		expect(await renameTag(w.env, 'one', 'two')).toMatchObject({
			ok: false,
			message: 'A tag with that name already exists.'
		});
		expect(await renameTag(w.env, 'nope', 'three')).toMatchObject({
			ok: false,
			message: 'That tag doesn’t exist.'
		});
	});

	it('deletes a tag: it leaves the list and its posts, and the posts stay', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		const projectId = await w.project(ada, 'Field test');
		const postId = await w.post(ada, projectId, 'Plan', 'Kickoff #launch #wip');
		await renameTag(w.env, 'wip', 'draft');

		expect(await deleteTag(w.env, 'draft')).toEqual({ ok: true });

		expect((await listTags(w.env, ada)).map((t) => t.name)).toEqual(['launch']);
		expect(await resolveTagName(w.env, 'wip')).toBeNull();
		expect((await loadPost(w.env, ada, postId)).title).toBe('Plan');
		expect(await deleteTag(w.env, 'draft')).toMatchObject({ ok: false });
	});
});

describe('migration 0039_tags', () => {
	const target = '0039_tags.sql';
	const migrations = (before: boolean) =>
		readdirSyncSorted().filter((f) => (before ? f < target : f === target));

	function readdirSyncSorted() {
		return readdirSync('migrations')
			.filter((f) => f.endsWith('.sql'))
			.sort();
	}

	it('gives every distinct existing tag one row and leaves every post tag as it was', () => {
		const sqlite = new DatabaseSync(':memory:');
		sqlite.exec('PRAGMA foreign_keys = ON');
		for (const f of migrations(true)) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
		sqlite.exec(`
			INSERT INTO users (id, email, name, username, created_at) VALUES ('u1', 'a@example.com', 'Ada', 'ada', 0);
			INSERT INTO projects (id, name, created_by, created_at) VALUES ('pr1', 'Field', 'u1', 0);
		`);
		const post = (id: string) =>
			sqlite.exec(
				`INSERT INTO posts (id, project_id, author_id, title, body, body_text, created_at, last_activity_at) VALUES ('${id}', 'pr1', 'u1', 't', '{}', 't', 0, 0)`
			);
		post('p1');
		post('p2');
		sqlite.exec(
			`INSERT INTO post_tags (post_id, tag) VALUES ('p1', 'launch'), ('p1', 'wip'), ('p2', 'launch')`
		);
		const before = sqlite.prepare('SELECT post_id, tag FROM post_tags ORDER BY post_id, tag').all();

		for (const f of migrations(false)) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));

		expect(
			sqlite.prepare('SELECT post_id, tag FROM post_tags ORDER BY post_id, tag').all()
		).toEqual(before);
		expect(sqlite.prepare('SELECT name FROM tags ORDER BY name').all()).toEqual([
			{ name: 'launch' },
			{ name: 'wip' }
		]);
		expect(
			sqlite
				.prepare(
					'SELECT count(*) AS n FROM post_tags JOIN tags ON tags.id = post_tags.tag_id AND tags.name = post_tags.tag'
				)
				.get()
		).toEqual({ n: 3 });
		expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
	});
});
