import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { createComment } from '#lib/server/posts/comments.js';
import { loadPost, parseBody, type BodyInput } from '#lib/server/posts/posts.js';
import { storeAttachment } from '#lib/server/posts/attachments.js';
import { doc, postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { load } from './+page.server';
import { GET as getFile } from './files/[id]/+server';
import { actions as postActions, load as loadPostPage } from '../../posts/[id]/+page.server';

type LoadEvent = Parameters<typeof load>[0];
type FileEvent = Parameters<typeof getFile>[0];
type PostActionEvent = Parameters<typeof postActions.publicLink>[0];
type PostLoadEvent = Parameters<typeof loadPostPage>[0];

async function publicWorld() {
	const w = await postsWorld();
	const ada = await w.person('Ada', 'member');
	const payroll = await w.project(ada, 'Payroll', true);
	const photo = await storeAttachment(
		w.env,
		ada,
		{ projectId: payroll },
		new File(['tent-bytes'], 'tent.png', { type: 'image/png' })
	);
	const other = await storeAttachment(
		w.env,
		ada,
		{ projectId: payroll },
		new File(['secret-bytes'], 'salaries.png', { type: 'image/png' })
	);
	const postId = await w.post(ada, payroll, 'Tent options', 'We picked the green tent.');
	const cy = await w.person('Cy', 'member');
	const body = JSON.stringify({
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'We picked the green tent with ' },
					{ type: 'mention', attrs: { id: cy.user.id, label: 'Cy' } }
				]
			},
			{ type: 'image', attrs: { src: `/files/attachments/${photo.id}`, alt: 'Tent' } }
		]
	});
	w.sqlite.prepare('UPDATE posts SET body = ? WHERE id = ?').run(body, postId);
	await w.post(ada, payroll, 'Salaries', 'Not for sharing');
	await createComment(
		w.env,
		ada,
		await loadPost(w.env, ada, postId),
		parseBody(doc('Internal: budget is tight')) as BodyInput,
		null
	);

	const share = (who: SignedIn, on: boolean) =>
		postActions.publicLink(
			routeEvent(
				who,
				`/posts/${postId}`,
				{ id: postId },
				{ on: String(on) }
			) as unknown as PostActionEvent
		);
	const linkOnPost = async (who: SignedIn) => {
		const event = routeEvent(who, `/posts/${postId}`, { id: postId });
		const data = (await loadPostPage(event as unknown as PostLoadEvent)) as {
			publicLink: { url: string | null } | null;
		};
		return data.publicLink;
	};
	const token = () =>
		(
			w.sqlite.prepare('SELECT public_token AS t FROM posts WHERE id = ?').get(postId) as {
				t: string;
			}
		).t;
	// Signed out: no session at all.
	const read = async (t: string) => {
		const headers: Record<string, string> = {};
		const event = {
			...routeEvent(null, `/p/${t}`, { token: t }),
			setHeaders: (h: Record<string, string>) => Object.assign(headers, h)
		};
		const data = await load(event as unknown as LoadEvent);
		return { data: data as Record<string, unknown>, headers };
	};
	const file = (t: string, id: string) =>
		getFile(routeEvent(null, `/p/${t}/files/${id}`, { token: t, id }) as unknown as FileEvent);
	return { ...w, ada, cy, postId, photo, other, share, linkOnPost, token, read, file };
}

describe('/p/[token]', () => {
	it('shows a shared post signed out with OG tags and nothing private', async () => {
		const w = await publicWorld();
		expect(await w.linkOnPost(w.ada)).toEqual({ url: null });
		await w.share(w.ada, true);
		const token = w.token();
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(await w.linkOnPost(w.ada)).toEqual({ url: `https://campfire.test/p/${token}` });

		const { data, headers } = await w.read(token);
		expect(data).toMatchObject({
			title: 'Tent options',
			description: 'We picked the green tent.',
			authorName: 'Ada',
			orgName: 'Northwind',
			imageUrl: `https://campfire.test/p/${token}/files/${w.photo.id}`
		});
		expect(Object.keys(data).sort()).toEqual(
			[
				'authorName',
				'body',
				'createdAt',
				'description',
				'filesUrl',
				'imageUrl',
				'indexable',
				'logoUrl',
				'orgName',
				'title',
				'url'
			].sort()
		);
		const page = JSON.stringify(data);
		const secrets = ['Payroll', 'Internal', 'Salaries', 'ada@example.com', w.postId, w.cy.user.id];
		for (const secret of secrets) {
			expect(page).not.toContain(secret);
		}
		// A mention keeps its name, so the post still reads as written.
		expect(page).toContain('"label":"Cy"');
		expect(headers['x-robots-tag']).toBe('noindex');

		const image = await w.file(token, w.photo.id);
		expect(await image.text()).toBe('tent-bytes');
		await expect(Promise.resolve(w.file(token, w.other.id))).rejects.toMatchObject({ status: 404 });
	});

	it('gives a signed-out reader a mention by its kind only, never the id it points at', async () => {
		const w = await publicWorld();
		const salaries = (
			w.sqlite.prepare("SELECT id FROM posts WHERE title = 'Salaries'").get() as { id: string }
		).id;
		const body = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'resourceMention', attrs: { kind: 'post', id: salaries } }]
				}
			]
		};
		w.sqlite.prepare('UPDATE posts SET body = ? WHERE id = ?').run(JSON.stringify(body), w.postId);
		await w.share(w.ada, true);
		const { data } = await w.read(w.token());
		expect(data.body).toEqual({
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'resourceMention', attrs: { kind: 'post' } }] }
			]
		});
		const page = JSON.stringify(data);
		expect(page, 'its id').not.toContain(salaries);
		expect(page, 'its title').not.toContain('Salaries');
	});

	it('stops working when revoked, and a new link doesn’t revive the old one', async () => {
		const w = await publicWorld();
		await w.share(w.ada, true);
		const first = w.token();
		await w.share(w.ada, false);
		expect(await w.linkOnPost(w.ada)).toEqual({ url: null });
		await expect(w.read(first)).rejects.toMatchObject({ status: 404 });
		await expect(Promise.resolve(w.file(first, w.photo.id))).rejects.toMatchObject({ status: 404 });

		await w.share(w.ada, true);
		expect(w.token()).not.toBe(first);
		await expect(w.read(first)).rejects.toMatchObject({ status: 404 });
	});

	it('404s every link while the org has public links off, and lets it index when allowed', async () => {
		const w = await publicWorld();
		await w.share(w.ada, true);
		const token = w.token();
		w.sqlite.exec('UPDATE org SET public_posts = 0');
		await expect(w.read(token)).rejects.toMatchObject({ status: 404 });
		expect(await w.linkOnPost(w.ada)).toBeNull();
		const refused = await Promise.resolve(w.share(w.ada, true)).catch((e) => e);
		expect(refused).toMatchObject({ status: 403 });

		w.sqlite.exec('UPDATE org SET public_posts = 1, public_posts_indexable = 1');
		const { headers } = await w.read(token);
		expect(headers['x-robots-tag']).toBeUndefined();
	});

	it('lets only the author or an admin share the post', async () => {
		const w = await publicWorld();
		const bo = await w.person('Bo', 'member');
		await w.addTo(w.ada, (await loadPost(w.env, w.ada, w.postId)).projectId, bo);
		expect(await w.linkOnPost(bo)).toBeNull();
		const refused = await Promise.resolve(w.share(bo, true)).catch((e) => e);
		expect(refused).toMatchObject({ status: 403 });

		const ida = await w.person('Ida', 'admin');
		await w.addTo(w.ada, (await loadPost(w.env, w.ada, w.postId)).projectId, ida);
		await w.share(ida, true);
		expect(w.token()).toBeTruthy();
	});
});
