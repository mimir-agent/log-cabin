import { describe, expect, it } from 'vitest';
import { chatWorld, status, text } from '#lib/server/testing/chat-world.js';
import { startDm, listThreads, loadThread } from './threads';
import { listMessages } from './messages';
import { startConversation } from './start';

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'map.png', { type: 'image/png' });
const pdf = () => new File(['%PDF'], 'plan.pdf', { type: 'application/pdf' });
const empty = { title: '', body: null, files: [] };

describe('starting a conversation from the new-chat step', () => {
	it('names a group without a title after its members, for each of them', async () => {
		const { env, person } = await chatWorld();
		const [ada, bo, cy] = [
			await person('Ada', 'member'),
			await person('Bo', 'member'),
			await person('Cy', 'member')
		];

		const id = await startConversation(env, ada, { ...empty, memberIds: [bo.user.id, cy.user.id] });

		expect((await loadThread(env, ada, id)).name).toBe('Bo and Cy');
		expect((await listThreads(env, cy)).find((t) => t.id === id)?.name).toBe('Ada and Bo');
	});

	it('makes a group of two or more other people, and opens the direct message for one', async () => {
		const { env, person } = await chatWorld();
		const [ada, bo, cy] = [
			await person('Ada', 'member'),
			await person('Bo', 'member'),
			await person('Cy', 'member')
		];
		const dm = await startDm(env, ada, bo.user.id);

		const one = await startConversation(env, ada, { ...empty, memberIds: [bo.user.id] });
		const two = await startConversation(env, ada, {
			...empty,
			memberIds: [bo.user.id, cy.user.id]
		});
		const named = await startConversation(env, ada, {
			...empty,
			title: 'Pair',
			memberIds: [bo.user.id]
		});

		expect(one).toBe(dm);
		expect((await loadThread(env, ada, two)).kind).toBe('group');
		expect((await loadThread(env, ada, named)).kind).toBe('group');
	});

	it('sends the first message with its files in the same step', async () => {
		const { env, person } = await chatWorld();
		const [ada, bo, cy] = [
			await person('Ada', 'member'),
			await person('Bo', 'member'),
			await person('Cy', 'member')
		];

		const id = await startConversation(env, ada, {
			title: '',
			memberIds: [bo.user.id, cy.user.id],
			body: text('Route attached').body,
			files: [png(), pdf()]
		});

		const [message] = await listMessages(env, bo, await loadThread(env, bo, id));
		expect(message.bodyText).toContain('Route attached');
		const body = message.body as { content: { type: string }[] };
		const types = body.content.map((node) => node.type);
		expect(types).toEqual(['paragraph', 'image', 'attachment']);
	});

	it('sends a message of files alone', async () => {
		const { env, person } = await chatWorld();
		const [ada, bo, cy] = [
			await person('Ada', 'member'),
			await person('Bo', 'member'),
			await person('Cy', 'member')
		];

		const id = await startConversation(env, ada, {
			...empty,
			memberIds: [bo.user.id, cy.user.id],
			files: [pdf()]
		});

		const [message] = await listMessages(env, bo, await loadThread(env, bo, id));
		expect(message.bodyText).toBe('plan.pdf');
	});

	it('refuses a file it can’t store before making the conversation', async () => {
		const { env, person } = await chatWorld();
		const [ada, bo, cy] = [
			await person('Ada', 'member'),
			await person('Bo', 'member'),
			await person('Cy', 'member')
		];
		const svg = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' });

		const refused = startConversation(env, ada, {
			...empty,
			memberIds: [bo.user.id, cy.user.id],
			files: [svg]
		});

		expect(await status(refused)).toBe(415);
		expect(await listThreads(env, ada)).toEqual([]);
	});

	it('starts no conversation with nobody else in it', async () => {
		const { env, person } = await chatWorld();
		const ada = await person('Ada', 'member');

		expect(await status(startConversation(env, ada, { ...empty, memberIds: [] }))).toBe(400);
	});
});
