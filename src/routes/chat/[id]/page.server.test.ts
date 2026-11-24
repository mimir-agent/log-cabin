import { describe, expect, it } from 'vitest';
import { chatWorld, text } from '#lib/server/testing/chat-world.js';
import { routeEvent } from '#lib/server/testing/posts-world.js';
import { sendMessage } from '#lib/server/chat/messages.js';
import { listThreads, loadThread, setUnread, startDm } from '#lib/server/chat/threads.js';
import { actions, load } from './+page.server';

const pause = () => new Promise((resolve) => setTimeout(resolve, 5));

/** Ada's DM with Bo, holding a message from Bo that Ada has not read, marked unread too. */
async function unreadDm() {
	const { env, person } = await chatWorld();
	// The page's load reads the org's settings.
	await env.DB.prepare("INSERT INTO org (id, name, created_at) VALUES (1, 'Log Cabin', 0)").run();
	const ada = await person('Ada', 'member');
	const bo = await person('Bo', 'member');
	const id = await startDm(env, ada, bo.user.id);
	// A message sent in the millisecond the thread began would count as already read.
	await pause();
	await sendMessage(env, bo, await loadThread(env, bo, id), text('Are you there?'), null);
	await setUnread(env, ada, await loadThread(env, ada, id), true);
	const ours = async () => (await listThreads(env, ada)).find((t) => t.id === id);
	const event = (fields?: Record<string, string>) => routeEvent(ada, `/chat/${id}`, { id }, fields);
	return { ours, event };
}

describe('opening a thread', () => {
	it('is not what loading its page does, since hovering a link to it loads the page too', async () => {
		const { ours, event } = await unreadDm();
		expect(await ours()).toMatchObject({ unread: 1, markedUnread: true });

		await load(event() as never);

		expect(await ours()).toMatchObject({ unread: 1, markedUnread: true });
	});

	it('marks it read, and clears its mark as unread, when the page asks', async () => {
		const { ours, event } = await unreadDm();
		await pause();

		await actions.read(event({}) as never);

		expect(await ours()).toMatchObject({ unread: 0, markedUnread: false });
	});
});
