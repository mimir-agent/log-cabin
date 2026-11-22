// Messages sent from this tab that the server hasn't confirmed yet. The thread shows them in
// full the moment Send is pressed, and the thread list moves their thread to the top. Each
// one carries the id the server stores it under from the start, so the thread hides it in the
// same frame the server's copy arrives, whether by the answer or by the socket's echo, and a
// retry of one that was stored after all doesn't store it twice.
import { invalidate } from '$app/navigation';
import { docText, type DocNode } from '#lib/editor/doc.js';
import { postAction } from '#lib/forms/submit.js';
import { newId } from '#lib/id.js';

export type Outgoing = {
	id: string;
	threadId: string;
	body: DocNode;
	text: string;
	replyToId: string | null;
	sentAt: number;
	failed: boolean;
	data: FormData;
};

export const outgoing = $state<Outgoing[]>([]);

/** Shows the message in `data` at once and sends it to the thread's `send` action. */
export function sendMessage(threadId: string, data: FormData) {
	const body = JSON.parse(String(data.get('body'))) as DocNode;
	const id = newId();
	data.set('id', id);
	outgoing.push({
		id,
		threadId,
		body,
		text: docText(body),
		replyToId: String(data.get('replyTo') ?? '') || null,
		sentAt: Date.now(),
		failed: false,
		data
	});
	return deliver(outgoing[outgoing.length - 1]);
}

/** Sends `message` again after it failed. */
export function retry(message: Outgoing) {
	return deliver(message);
}

/** Forgets the messages with these ids: the server's copies have taken their place. */
export function arrived(ids: string[]) {
	for (const id of ids) {
		const i = outgoing.findIndex((o) => o.id === id);
		if (i !== -1) outgoing.splice(i, 1);
	}
}

async function deliver(message: Outgoing) {
	message.failed = false;
	const result = await postAction(`/chat/${message.threadId}?/send`, message.data);
	if (result.type !== 'success') {
		message.failed = true;
		return;
	}
	await Promise.all([invalidate('chat:thread'), invalidate('chat:threads')]);
	arrived([message.id]);
}
