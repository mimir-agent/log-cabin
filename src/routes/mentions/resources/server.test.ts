import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { resourceWorld } from '#lib/server/testing/resource-world.js';
import { GET as search } from './+server';
import { GET as one } from './[kind]/[id]/+server';

type World = ReturnType<typeof resourceWorld>;

function event(w: World, userId: string | null, path: string, params: Record<string, string> = {}) {
	const who = userId ? w.as(userId) : null;
	return {
		locals: { user: who?.user ?? null, member: who?.member ?? null },
		url: new URL(`https://campfire.test${path}`),
		params
	} as never;
}

async function status(run: () => Response | Promise<Response>): Promise<number> {
	try {
		return (await run()).status;
	} catch (e) {
		if (isHttpError(e) || isRedirect(e)) return e.status;
		throw e;
	}
}

describe('GET /mentions/resources', () => {
	it('lists only what the person may see, at most ten', async () => {
		const w = resourceWorld();
		for (let i = 0; i < 12; i++) w.post(`post-${i}`, 'Open', `Harbour shift ${i}`);
		const items = async (userId: string) =>
			(
				(await (await search(event(w, userId, '/mentions/resources?q=harbour'))).json()) as {
					items: { kind: string; id: string; title: string }[];
				}
			).items;

		const bo = await items('bo');
		expect(bo).toHaveLength(10);
		expect(
			bo.map((item) => item.id),
			'nothing from the private project'
		).not.toContain('post-vault');
		expect(
			bo.map((item) => item.id),
			'no note that isn’t shared with them'
		).not.toContain('note-private');
		expect(await items('cy'), 'a guest in no project').toEqual([]);
	});

	it('sends a signed-out visitor to sign in', async () => {
		const w = resourceWorld();
		expect(await status(() => search(event(w, null, '/mentions/resources?q=harbour')))).toBe(303);
	});
});

describe('GET /mentions/resources/[kind]/[id]', () => {
	const get = (w: World, userId: string | null, kind: string, id: string) =>
		status(() => one(event(w, userId, `/mentions/resources/${kind}/${id}`, { kind, id })));

	it('gives the title and page of what the person may see', async () => {
		const w = resourceWorld();
		const response = await one(
			event(w, 'bo', '/mentions/resources/post/post-open', { kind: 'post', id: 'post-open' })
		);
		expect(await response.json()).toEqual({ title: 'Harbour budget', url: '/posts/post-open' });
	});

	it('404s what the person can’t see, what isn’t there and any other kind', async () => {
		const w = resourceWorld();
		expect(await get(w, 'bo', 'post', 'post-vault'), 'a private project’s post').toBe(404);
		expect(await get(w, 'bo', 'note', 'note-private'), 'a note not shared').toBe(404);
		expect(await get(w, 'bo', 'call', 'call-vault'), 'a call they weren’t in').toBe(404);
		expect(await get(w, 'cy', 'post', 'post-open'), 'a guest outside the project').toBe(404);
		expect(await get(w, 'dee', 'note', 'note-private'), 'an admin it isn’t shared with').toBe(404);
		expect(await get(w, 'ada', 'post', 'gone'), 'a post that isn’t there').toBe(404);
		expect(await get(w, 'ada', 'project', 'Open'), 'not a kind a mention names').toBe(404);
		expect(await get(w, null, 'post', 'post-open'), 'signed out: sent to sign in').toBe(303);
	});
});
