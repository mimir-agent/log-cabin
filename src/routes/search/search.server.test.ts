import { describe, expect, it } from 'vitest';
import { notificationWorld } from '#lib/server/notifications/testing/world.js';
import { load } from './+page.server';
import { GET } from './quick/+server';

function signedIn(userId: string, role: string, path: string) {
	return {
		locals: {
			user: { id: userId, name: userId, email: `${userId}@example.com`, avatarUrl: null },
			member: { id: `m-${userId}`, role }
		},
		url: new URL(`https://campfire.test${path}`)
	} as never;
}

function world() {
	const w = notificationWorld();
	w.person('ada');
	w.person('bo');
	w.project('Lighthouse', 'ada');
	w.project('Vault', 'ada', { private: true, members: ['ada'] });
	w.sqlite.exec(
		"UPDATE projects SET description = 'harbour lights' WHERE id IN ('Lighthouse', 'Vault')"
	);
	return w;
}

const pageProjects = async (userId: string, q: string) => {
	const data = (await load(signedIn(userId, 'member', `/search?q=${q}`))) as {
		hits: { kind: string; id: string }[];
	};
	return data.hits.filter((hit) => hit.kind === 'project').map((hit) => hit.id);
};

const quickProjects = async (userId: string, q: string) => {
	const response = await GET(signedIn(userId, 'member', `/search/quick?q=${q}`));
	const lists = (await response.json()) as {
		projects: { id: string }[];
		hits: { kind: string }[];
	};
	expect(lists.hits.filter((hit) => hit.kind === 'project')).toEqual([]);
	return lists.projects.map((project) => project.id);
};

describe('correcting a misspelt search', () => {
	function campsite() {
		const w = world();
		w.person('cy', 'guest');
		w.post('p-tents', 'Lighthouse', 'ada');
		w.post('p-kayaks', 'Vault', 'ada');
		w.sqlite.exec(`UPDATE posts SET title = 'Pitch the tents' WHERE id = 'p-tents';
			UPDATE posts SET title = 'Rent the kayaks' WHERE id = 'p-kayaks'`);
		return w;
	}

	const searchFor = async (userId: string, role: string, query: string) => {
		const data = (await load(signedIn(userId, role, `/search?${query}`))) as {
			hits: { id: string }[];
			correction: string | null;
		};
		return { ids: data.hits.map((hit) => hit.id), correction: data.correction };
	};

	it('shows results for the nearest words when the typed ones find nothing', async () => {
		campsite();
		expect(await searchFor('bo', 'member', 'q=tnets')).toEqual({
			ids: ['p-tents'],
			correction: 'tents'
		});
		expect(await searchFor('bo', 'member', 'q=pitch+teh+tnets')).toEqual({
			ids: ['p-tents'],
			correction: 'pitch the tents'
		});
	});

	it('leaves a search that finds something as it was', async () => {
		campsite();
		expect(await searchFor('bo', 'member', 'q=tents')).toEqual({
			ids: ['p-tents'],
			correction: null
		});
		expect(await searchFor('bo', 'member', 'q=tent')).toEqual({
			ids: ['p-tents'],
			correction: null
		});
	});

	it('searches exactly what was typed when asked to', async () => {
		campsite();
		expect(await searchFor('bo', 'member', 'q=tnets&exact')).toEqual({ ids: [], correction: null });
	});

	it('corrects only towards results the searcher may see', async () => {
		campsite();
		expect(await searchFor('ada', 'member', 'q=kayask')).toEqual({
			ids: ['p-kayaks'],
			correction: 'kayak'
		});
		expect(await searchFor('bo', 'member', 'q=kayask')).toEqual({ ids: [], correction: null });
		expect(await searchFor('cy', 'guest', 'q=tnets')).toEqual({ ids: [], correction: null });
	});

	it('corrects a word that only rows the searcher can’t see hold', async () => {
		const w = world();
		w.post('p-tents', 'Lighthouse', 'ada');
		w.post('p-typo', 'Vault', 'ada');
		w.sqlite.exec(`UPDATE posts SET title = 'Pitch the tents' WHERE id = 'p-tents';
			UPDATE posts SET title = 'Packed the tnets' WHERE id = 'p-typo'`);
		expect(await searchFor('bo', 'member', 'q=tnets')).toEqual({
			ids: ['p-tents'],
			correction: 'tents'
		});
	});

	it('picks between equally near words without counting rows the searcher can’t see', async () => {
		const corrections = [];
		for (const privateWord of ['tent', 'tend']) {
			const w = world();
			for (const id of ['o1', 'o2']) w.post(id, 'Lighthouse', 'ada');
			for (const id of ['v1', 'v2', 'v3']) w.post(id, 'Vault', 'ada');
			w.sqlite.exec(`UPDATE posts SET title = 'tent' WHERE id = 'o1';
				UPDATE posts SET title = 'tend' WHERE id = 'o2';
				UPDATE posts SET title = '${privateWord}' WHERE id IN ('v1', 'v2', 'v3')`);
			corrections.push((await searchFor('bo', 'member', 'q=tenx')).correction);
		}
		expect(corrections).toEqual(['tend', 'tend']);
	});

	it('offers no correction built from a word only rows the searcher can’t see hold', async () => {
		const results = [];
		for (const privateWord of [
			// A control: far from "hopng", so the vault could not offer it either way.
			'nothing',
			// "hop" and "ing" make "hoping", one edit from "hopng".
			'hop',
			// Stems to "hop".
			'hopped'
		]) {
			const w = world();
			w.post('o1', 'Lighthouse', 'ada');
			w.post('v1', 'Vault', 'ada');
			w.sqlite.exec(`UPDATE posts SET title = 'hope' WHERE id = 'o1';
				UPDATE posts SET title = '${privateWord}' WHERE id = 'v1'`);
			results.push(await searchFor('bo', 'member', 'q=hopng'));
		}
		expect(results).toEqual(Array(3).fill({ ids: [], correction: null }));
	});
});

describe('finding projects on the search page and in the quick switcher', () => {
	it('finds a project by its name or its description', async () => {
		world();
		for (const find of [pageProjects, quickProjects]) {
			expect(await find('bo', 'lighthouse')).toEqual(['Lighthouse']);
			expect(await find('bo', 'harbour')).toEqual(['Lighthouse']);
		}
	});

	it('finds a private project only for its members', async () => {
		world();
		for (const find of [pageProjects, quickProjects]) {
			expect(await find('bo', 'vault')).toEqual([]);
			expect(await find('ada', 'vault')).toEqual(['Vault']);
			expect((await find('ada', 'harbour')).sort()).toEqual(['Lighthouse', 'Vault']);
		}
	});
});
