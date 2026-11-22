import { describe, expect, it } from 'vitest';
import type { ResourceRef } from '../../editor/doc';
import { resourceWorld } from '../testing/resource-world';
import { findResources, resourceTitles } from './resources';

const everything: ResourceRef[] = [
	{ kind: 'post', id: 'post-open' },
	{ kind: 'post', id: 'post-vault' },
	{ kind: 'note', id: 'note-bo' },
	{ kind: 'note', id: 'note-private' },
	{ kind: 'call', id: 'call-open' },
	{ kind: 'call', id: 'call-vault' },
	{ kind: 'call', id: 'call-untitled' },
	{ kind: 'note', id: 'post-open' },
	{ kind: 'post', id: 'gone' }
];

describe('resourceTitles', () => {
	it('gives the author every title and page, and nothing for a target that isn’t there', async () => {
		const w = resourceWorld();
		expect(await resourceTitles(w.env, w.as('ada'), everything)).toEqual({
			'post:post-open': { title: 'Harbour budget', url: '/posts/post-open' },
			'post:post-vault': { title: 'Harbour secret', url: '/posts/post-vault' },
			'note:note-bo': { title: 'Harbour packing list', url: '/notes/note-bo' },
			'note:note-private': { title: 'Harbour diary', url: '/notes/note-private' },
			'call:call-open': { title: 'Harbour standup', url: '/calls/call-open' },
			'call:call-vault': { title: 'Harbour board', url: '/calls/call-vault' },
			'call:call-untitled': { title: 'Untitled call', url: '/calls/call-untitled' }
		});
	});

	it('leaves out what a member can’t see: a private project they aren’t in, a note not shared with them', async () => {
		const w = resourceWorld();
		expect(Object.keys(await resourceTitles(w.env, w.as('bo'), everything)).sort()).toEqual([
			'call:call-open',
			'call:call-untitled',
			'note:note-bo',
			'post:post-open'
		]);
	});

	it('gives a guest nothing from a public project they weren’t added to', async () => {
		const w = resourceWorld();
		expect(await resourceTitles(w.env, w.as('cy'), everything)).toEqual({});
		w.sqlite.prepare("INSERT INTO project_members VALUES ('Open', 'cy', 0)").run();
		expect(Object.keys(await resourceTitles(w.env, w.as('cy'), everything)).sort()).toEqual([
			'call:call-open',
			'call:call-untitled',
			'post:post-open'
		]);
	});

	it('gives an admin no more than a member: no unshared note, no private project’s post or call', async () => {
		const w = resourceWorld();
		const titles = await resourceTitles(w.env, w.as('dee'), everything);
		expect(titles['note:note-private']).toBeUndefined();
		expect(titles['post:post-vault']).toBeUndefined();
		expect(titles['call:call-vault']).toBeUndefined();
		expect(titles['post:post-open']).toBeDefined();
	});

	it('shows a call to someone who was in it, though its project is closed to them', async () => {
		const w = resourceWorld();
		w.sqlite
			.prepare(
				"INSERT INTO call_participants (id, call_id, user_id, session_id, joined_at) VALUES ('cp', 'call-vault', 'bo', 's', 0)"
			)
			.run();
		const titles = await resourceTitles(w.env, w.as('bo'), everything);
		expect(titles['call:call-vault']).toEqual({ title: 'Harbour board', url: '/calls/call-vault' });
		expect(titles['post:post-vault'], 'the project stays closed').toBeUndefined();
	});

	it('looks up a body mentioning more targets than D1 binds in one statement', async () => {
		const w = resourceWorld();
		const many: ResourceRef[] = Array.from({ length: 150 }, (_, i) => ({
			kind: 'post',
			id: `missing-${i}`
		}));
		const titles = await resourceTitles(w.env, w.as('bo'), [...many, ...everything]);
		expect(titles['post:post-open']?.title).toBe('Harbour budget');
	});

	it('shows a renamed target by its new title, since the body never held one', async () => {
		const w = resourceWorld();
		w.sqlite.exec("UPDATE posts SET title = 'Harbour budget, final' WHERE id = 'post-open'");
		const titles = await resourceTitles(w.env, w.as('bo'), everything);
		expect(titles['post:post-open'].title).toBe('Harbour budget, final');
	});
});

describe('findResources', () => {
	it('offers only the notes, posts and calls this person may see, without match marks', async () => {
		const w = resourceWorld();
		const found = await findResources(w.env, w.as('bo'), 'harb');
		expect(found.map((item) => `${item.kind}:${item.id}`).sort()).toEqual([
			'call:call-open',
			'note:note-bo',
			'post:post-open'
		]);
		expect(found.find((item) => item.id === 'post-open')?.title).toBe('Harbour budget');
		expect(await findResources(w.env, w.as('cy'), 'harbour'), 'a guest in no project').toEqual([]);
	});

	it('offers at most ten', async () => {
		const w = resourceWorld();
		for (let i = 0; i < 12; i++) w.post(`post-${i}`, 'Open', `Harbour shift ${i}`);
		expect(await findResources(w.env, w.as('bo'), 'harbour')).toHaveLength(10);
	});

	it('offers nothing before anything is typed', async () => {
		const w = resourceWorld();
		expect(await findResources(w.env, w.as('ada'), '')).toEqual([]);
	});
});
