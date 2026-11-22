import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { getMember, memberIdForEmail, setDeactivated } from '#lib/server/members.js';
import { postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { notify } from '#lib/server/notifications/notify.js';
import { load } from './+layout.server';

type LoadEvent = Parameters<typeof load>[0];

const rootData = async (who: SignedIn) =>
	(await load(routeEvent(who, '/', {}) as unknown as LoadEvent)) as {
		people: { id: string; name: string }[];
		recent: { href: string }[];
		memberZone: string | null;
	};

describe('the root layout’s zones', () => {
	it('sends the viewer’s saved zone, so their browser can update it, and none signed out', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		expect((await rootData(ada)).memberZone).toBe('UTC');
		expect((await load(routeEvent(null, '/', {}) as unknown as LoadEvent))?.memberZone).toBeNull();
	});
});

describe('the root layout’s lists for the quick switcher', () => {
	it('sends the people the viewer may find, with only their id and name', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		await w.person('Max', 'member');
		const people = (await rootData(ada)).people;
		expect(people).toEqual([
			{ id: await memberIdForEmail(w.env, 'ada@example.com'), name: 'Ada' },
			{ id: await memberIdForEmail(w.env, 'max@example.com'), name: 'Max' }
		]);
	});

	it('leaves out a deactivated member, and gives a guest nobody', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		const max = await w.person('Max', 'member');
		const gus = await w.person('Gus', 'guest');
		const row = await getMember(w.env, (await memberIdForEmail(w.env, max.user.email)) ?? '');
		if (!row) throw new Error(`expected a member row for ${max.user.email}`);
		await setDeactivated(w.env, row, true);
		expect((await rootData(ada)).people.map((p) => p.name)).toEqual(['Ada', 'Gus']);
		expect((await rootData(gus)).people).toEqual([]);
	});

	it('sends the recent posts the viewer can see, and none they can’t', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		const max = await w.person('Max', 'member');
		const open = await w.project(ada, 'Lighthouse');
		const secret = await w.project(ada, 'Vault', true);
		const shown = await w.post(ada, open, 'Tents');
		await w.post(ada, secret, 'Kayaks');
		expect((await rootData(max)).recent.map((r) => r.href)).toEqual([`/posts/${shown}`]);
	});
});

describe('the root layout’s word on the inbox', () => {
	it('tells a page what the inbox holds about it, including from the inbox’s own pane', async () => {
		const w = await postsWorld();
		const ada = await w.person('Ada', 'member');
		const max = await w.person('Max', 'member');
		const project = await w.project(ada, 'Lighthouse');
		const post = await w.post(ada, project, 'Tents');
		await notify(w.env, [max.user.id], {
			actorId: ada.user.id,
			kind: 'comment',
			itemKey: `post:${post}`,
			url: `/posts/${post}#comment-c1`,
			title: 'Tents',
			facts: { about: 'comment', title: 'Tents' },
			source: 'c1'
		});
		const about = async (path: string) =>
			((await load(routeEvent(max, path, {}) as unknown as LoadEvent)) as { about: unknown }).about;
		const expected = { path: `/posts/${post}`, itemKeys: [`post:${post}`], unread: true };
		expect(await about(`/posts/${post}`)).toEqual(expected);
		expect(await about(`/inbox/posts/${post}?tab=unread`)).toEqual(expected);
		expect(await about('/home')).toEqual({ path: '/home', itemKeys: [], unread: false });
	});
});
