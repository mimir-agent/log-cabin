import type { ActionFailure } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { actions, load } from './+page.server';

type ActionEvent = Parameters<typeof actions.addBookmark>[0];
type LoadEvent = Parameters<typeof load>[0];
type Bookmark = { id: string; title: string; url: string };

async function bookmarkWorld() {
	const w = await postsWorld();
	const ada = await w.person('Ada', 'member');
	const projectId = await w.project(ada, 'Field test');
	const act = (who: SignedIn, name: keyof typeof actions, fields: Record<string, string>) =>
		actions[name](
			routeEvent(who, `/projects/${projectId}`, { id: projectId }, fields) as unknown as ActionEvent
		);
	const bookmarks = async (who: SignedIn) => {
		const event = routeEvent(who, `/projects/${projectId}`, { id: projectId });
		return ((await load(event as unknown as LoadEvent)) as { bookmarks: Bookmark[] }).bookmarks;
	};
	const titles = async (who: SignedIn) => (await bookmarks(who)).map((b) => b.title);
	return { ...w, ada, projectId, act, bookmarks, titles };
}

describe('bookmarks on /projects/[id]', () => {
	it('adds links in order, moves one up and down, and removes one', async () => {
		const w = await bookmarkWorld();
		const bo = await w.person('Bo', 'member');
		await w.act(w.ada, 'addBookmark', { title: 'Map', url: 'https://example.com/map' });
		await w.act(bo, 'addBookmark', { title: 'Permits', url: 'http://example.org/permits' });
		await w.act(w.ada, 'addBookmark', { title: 'Weather', url: 'https://example.net/' });
		expect(await w.bookmarks(bo)).toMatchObject([
			{ title: 'Map', url: 'https://example.com/map' },
			{ title: 'Permits', url: 'http://example.org/permits' },
			{ title: 'Weather', url: 'https://example.net/' }
		]);

		const [map, permits, weather] = await w.bookmarks(w.ada);
		await w.act(bo, 'moveBookmark', { bookmarkId: weather.id, direction: 'up' });
		expect(await w.titles(w.ada)).toEqual(['Map', 'Weather', 'Permits']);
		await w.act(bo, 'moveBookmark', { bookmarkId: map.id, direction: 'down' });
		expect(await w.titles(w.ada)).toEqual(['Weather', 'Map', 'Permits']);
		await w.act(bo, 'moveBookmark', { bookmarkId: permits.id, direction: 'down' });
		expect(await w.titles(w.ada)).toEqual(['Weather', 'Map', 'Permits']);

		await w.act(w.ada, 'removeBookmark', { bookmarkId: map.id });
		expect(await w.titles(bo)).toEqual(['Weather', 'Permits']);
		await w.act(w.ada, 'moveBookmark', { bookmarkId: permits.id, direction: 'up' });
		expect(await w.titles(bo)).toEqual(['Permits', 'Weather']);
	});

	it('says what is wrong with a link that has no title or isn’t a web address', async () => {
		const w = await bookmarkWorld();
		for (const fields of [
			{ title: '', url: 'https://example.com' },
			{ title: 'Script', url: 'javascript:alert(1)' },
			{ title: 'Nothing', url: 'example.com' }
		]) {
			const result = (await w.act(w.ada, 'addBookmark', fields)) as ActionFailure<{
				bookmarkError: string;
			}>;
			expect(result.status, JSON.stringify(fields)).toBe(400);
			expect(result.data.bookmarkError, JSON.stringify(fields)).toBeTruthy();
		}
		expect(await w.bookmarks(w.ada)).toEqual([]);
	});

	it('refuses a viewer, and a guest outside the project can’t see or change the links', async () => {
		const w = await bookmarkWorld();
		await w.act(w.ada, 'addBookmark', { title: 'Map', url: 'https://example.com/map' });
		const [map] = await w.bookmarks(w.ada);
		const vic = await w.person('Vic', 'viewer');
		expect(await w.titles(vic)).toEqual(['Map']);
		const viewer = await Promise.resolve(
			w.act(vic, 'removeBookmark', { bookmarkId: map.id })
		).catch((e: unknown) => e);
		expect(viewer).toMatchObject({ status: 403 });

		const gus = await w.person('Gus', 'guest');
		const guest = await Promise.resolve(
			w.act(gus, 'addBookmark', { title: 'Mine', url: 'https://example.com' })
		).catch((e: unknown) => e);
		expect(guest).toMatchObject({ status: 404 });
		expect(await w.titles(w.ada)).toEqual(['Map']);
	});
});
