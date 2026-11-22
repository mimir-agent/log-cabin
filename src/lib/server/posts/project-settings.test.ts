import { describe, expect, it } from 'vitest';
import { posts } from '../../strings/posts';
import { postsWorld } from '../testing/posts-world';
import { canUpdateProject, loadProject } from './access';
import { updateBookmark, addBookmark, projectBookmarks } from './bookmarks';
import { listProjects, updateProject } from './projects';

const settings = { name: 'Field test', description: '', accessory: '', private: false };

async function world() {
	const w = await postsWorld();
	const admin = await w.person('Ada', 'admin');
	const member = await w.person('Bo', 'member');
	const viewer = await w.person('Vi', 'viewer');
	const guest = await w.person('Gus', 'guest');
	const projectId = await w.project(member, 'Field test');
	const load = (who: typeof admin) => loadProject(w.env, who, projectId);
	return { ...w, admin, member, viewer, guest, projectId, load };
}

describe('who may change a channel, as project_policy.rb#update?', () => {
	it('lets everyone who can see it except guests', async () => {
		const w = await world();
		const other = await w.person('Cy', 'member');
		expect(canUpdateProject(w.admin, await w.load(w.admin))).toBe(true);
		expect(canUpdateProject(other, await w.load(other))).toBe(true);
		expect(canUpdateProject(w.viewer, await w.load(w.viewer))).toBe(true);
		await w.addTo(w.member, w.projectId, w.guest);
		expect(canUpdateProject(w.guest, await w.load(w.guest))).toBe(false);
	});

	it('refuses a guest, and changes nothing', async () => {
		const w = await world();
		await w.addTo(w.member, w.projectId, w.guest);
		await expect(
			updateProject(w.env, w.guest, await w.load(w.guest), { ...settings, description: 'x' })
		).rejects.toMatchObject({ status: 403 });
		expect((await w.load(w.member)).description).toBe('');
	});
});

describe('changing a channel', () => {
	it('saves the description, the emoji and the name, and reads them back', async () => {
		const w = await world();
		const result = await updateProject(w.env, w.member, await w.load(w.member), {
			name: 'Base camp',
			description: 'Where we meet',
			accessory: '🏕️',
			private: false
		});
		expect(result).toEqual({ ok: true });
		expect(await w.load(w.member)).toMatchObject({
			name: 'Base camp',
			description: 'Where we meet',
			accessory: '🏕️'
		});
		const [row] = await listProjects(w.env, w.member, false);
		expect(row.accessory).toBe('🏕️');
	});

	it('removes the emoji when it is empty', async () => {
		const w = await world();
		await updateProject(w.env, w.member, await w.load(w.member), { ...settings, accessory: '🏕️' });
		await updateProject(w.env, w.member, await w.load(w.member), settings);
		expect((await w.load(w.member)).accessory).toBeNull();
	});

	it('refuses an empty name with the reason', async () => {
		const w = await world();
		const result = await updateProject(w.env, w.member, await w.load(w.member), {
			...settings,
			name: ' '
		});
		expect(result).toEqual({ ok: false, message: posts.errors.projectNameMissing });
	});

	it('refuses an emoji longer than a few characters, with the reason', async () => {
		const w = await world();
		const result = await updateProject(w.env, w.member, await w.load(w.member), {
			...settings,
			accessory: '🏕️'.repeat(20)
		});
		expect(result).toEqual({ ok: false, message: posts.channelSettings.accessoryTooLong });
		expect((await w.load(w.member)).accessory).toBeNull();
	});
});

describe('making a channel private, as Campsite does', () => {
	it('removes it for people who are not in it, and keeps it for those who are', async () => {
		const w = await world();
		const insider = await w.person('Cy', 'member');
		const outsider = await w.person('Di', 'member');
		await w.addTo(w.member, w.projectId, insider);
		expect((await listProjects(w.env, outsider, false)).map((p) => p.id)).toContain(w.projectId);

		await updateProject(w.env, w.admin, await w.load(w.admin), { ...settings, private: true });

		await expect(w.load(outsider)).rejects.toMatchObject({ status: 404 });
		expect((await listProjects(w.env, outsider, false)).map((p) => p.id)).not.toContain(
			w.projectId
		);
		expect((await listProjects(w.env, insider, false)).map((p) => p.id)).toContain(w.projectId);
		expect((await w.load(insider)).private).toBe(true);
	});

	it('is undone by making it public again', async () => {
		const w = await world();
		const outsider = await w.person('Di', 'member');
		await updateProject(w.env, w.member, await w.load(w.member), { ...settings, private: true });
		await updateProject(w.env, w.member, await w.load(w.member), settings);
		expect((await w.load(outsider)).private).toBe(false);
	});

	it('refuses when nobody would be in it', async () => {
		const w = await world();
		w.sqlite.exec('DELETE FROM project_members');
		expect(
			await updateProject(w.env, w.admin, await w.load(w.admin), { ...settings, private: true })
		).toEqual({ ok: false, message: posts.channelSettings.privateNeedsMember });
	});
});

describe('editing a bookmark in place', () => {
	it('keeps its place in the list and its id', async () => {
		const w = await world();
		await addBookmark(w.env, w.member, w.projectId, {
			title: 'Map',
			url: 'https://example.com/map'
		});
		await addBookmark(w.env, w.member, w.projectId, {
			title: 'Permits',
			url: 'https://example.org/'
		});
		const [map] = await projectBookmarks(w.env, w.projectId);

		await updateBookmark(w.env, w.member, w.projectId, map.id, {
			title: 'Trail map',
			url: 'https://example.com/trail'
		});

		expect(await projectBookmarks(w.env, w.projectId)).toMatchObject([
			{ id: map.id, title: 'Trail map', url: 'https://example.com/trail' },
			{ title: 'Permits' }
		]);
	});

	it('refuses a viewer', async () => {
		const w = await world();
		await addBookmark(w.env, w.member, w.projectId, {
			title: 'Map',
			url: 'https://example.com/map'
		});
		const [map] = await projectBookmarks(w.env, w.projectId);
		await expect(
			updateBookmark(w.env, w.viewer, w.projectId, map.id, {
				title: 'x',
				url: 'https://example.com/'
			})
		).rejects.toMatchObject({ status: 403 });
	});
});
