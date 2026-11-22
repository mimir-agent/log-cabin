import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { actions, load } from './+page.server';
import { load as loadRoot } from '../../+layout.server';
import { actions as postActions, load as loadPost } from '../../posts/[id]/+page.server';

type ActionEvent = Parameters<typeof actions.add>[0];
type LoadEvent = Parameters<typeof load>[0];
type RootEvent = Parameters<typeof loadRoot>[0];
type PostActionEvent = Parameters<typeof postActions.react>[0];
type PostLoadEvent = Parameters<typeof loadPost>[0];

const png = (bytes = 100) =>
	new File([new Uint8Array(bytes)], 'campfire.png', { type: 'image/png' });

async function emojiWorld() {
	const w = await postsWorld();
	const ada = await w.person('Ada', 'member');
	const ida = await w.person('Ida', 'admin');
	const act = (who: SignedIn, name: keyof typeof actions, fields: Record<string, string | Blob>) =>
		Promise.resolve(
			actions[name](routeEvent(who, '/settings/emoji', {}, fields) as unknown as ActionEvent)
		);
	const add = (who: SignedIn, name: string, file: File) => act(who, 'add', { name, file });
	const names = async (who: SignedIn) => {
		const data = (await load(routeEvent(who, '/settings/emoji', {}) as unknown as LoadEvent)) as {
			emoji: { name: string }[];
		};
		return data.emoji.map((e) => e.name);
	};
	const refusal = (result: unknown) => {
		const { status, data } = result as { status: number; data: { field: string; message: string } };
		return { status, field: data.field, message: data.message };
	};
	return { ...w, ada, ida, act, add, names, refusal };
}

describe('/settings/emoji', () => {
	it('adds an emoji people can use as a reaction and in text', async () => {
		const w = await emojiWorld();
		expect(await w.add(w.ada, 'campfire', png())).toBeUndefined();
		expect(await w.names(w.ada)).toEqual(['campfire']);
		const [key] = [...w.bucket.objects.keys()];
		expect(key).toMatch(/^emoji\//);

		const root = (await loadRoot(routeEvent(w.ada, '/', {}) as unknown as RootEvent)) as {
			orgEmoji: { custom: Record<string, string> };
		};
		expect(root.orgEmoji.custom).toEqual({ campfire: `/files/${key}` });

		const projectId = await w.project(w.ada, 'Field test');
		const postId = await w.post(w.ada, projectId, 'Tents', 'Ready :campfire:');
		const react = (emoji: string) =>
			Promise.resolve(
				postActions.react(
					routeEvent(
						w.ada,
						`/posts/${postId}`,
						{ id: postId },
						{
							subjectType: 'post',
							subjectId: postId,
							emoji
						}
					) as unknown as PostActionEvent
				)
			);
		await react(':campfire:');
		await react('🫡');
		const page = (await loadPost(
			routeEvent(w.ada, `/posts/${postId}`, { id: postId }) as unknown as PostLoadEvent
		)) as { reactions: Record<string, { emoji: string }[]> };
		expect(page.reactions[postId].map((r) => r.emoji)).toEqual([':campfire:', '🫡']);

		const unknown = await react(':nope:').catch((e) => e);
		expect(unknown).toMatchObject({ status: 400 });
	});

	it('refuses images over 256 KB, SVG, and names that are taken or malformed', async () => {
		const w = await emojiWorld();
		expect(await w.add(w.ada, 'ok', png(256 * 1024))).toBeUndefined();
		expect(w.refusal(await w.add(w.ada, 'big', png(256 * 1024 + 1)))).toEqual({
			status: 400,
			field: 'file',
			message: 'campfire.png is larger than 256 KB. Use a smaller image.'
		});
		const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
		expect(w.refusal(await w.add(w.ada, 'logo', svg))).toMatchObject({ field: 'file' });
		const gif = new File([new Uint8Array(10)], 'wave.gif', { type: 'image/gif' });
		const webp = new File([new Uint8Array(10)], 'wave.webp', { type: 'image/webp' });
		expect(await w.add(w.ada, 'wave', gif)).toBeUndefined();
		expect(await w.add(w.ada, 'wave-2', webp)).toBeUndefined();
		expect(w.refusal(await w.add(w.ada, 'wave', png()))).toMatchObject({ field: 'name' });
		expect(w.refusal(await w.add(w.ada, 'Ship It', png()))).toMatchObject({ field: 'name' });
		expect(await w.names(w.ada)).toEqual(['ok', 'wave', 'wave-2']);
	});

	it('lets an admin keep adding to admins, and only the adder or an admin remove one', async () => {
		const w = await emojiWorld();
		const vic = await w.person('Vic', 'viewer');
		const viewer = await w.add(vic, 'nope', png()).catch((e) => e);
		expect(viewer).toMatchObject({ status: 403 });

		await w.add(w.ada, 'tent', png());
		const [tent] = w.sqlite.prepare('SELECT id FROM custom_emoji').all() as { id: string }[];
		const bo = await w.person('Bo', 'member');
		const notBos = await w.act(bo, 'remove', { id: tent.id }).catch((e) => e);
		expect(notBos).toMatchObject({ status: 403 });

		await w.act(w.ida, 'whoMayAdd', { customEmojiBy: 'admins' });
		const member = await w.add(w.ada, 'later', png()).catch((e) => e);
		expect(member).toMatchObject({ status: 403 });
		const notAdmin = await w.act(w.ada, 'whoMayAdd', { customEmojiBy: 'members' }).catch((e) => e);
		expect(notAdmin).toMatchObject({ status: 403 });
		expect(await w.add(w.ida, 'later', png())).toBeUndefined();

		await w.act(w.ida, 'remove', { id: tent.id });
		expect(await w.names(w.ada)).toEqual(['later']);
		expect(w.bucket.objects.has(`emoji/${tent.id}`)).toBe(false);
	});
});
