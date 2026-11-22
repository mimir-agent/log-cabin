import { fail, redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { clientId } from '#lib/server/id.js';
import { startCall } from '#lib/server/calls/calls.js';
import { threadCalls } from '#lib/server/calls/history.js';
import { heldNotifications, notifyAnyway } from '#lib/server/chat/anyway.js';
import {
	addPeople,
	canDeleteThread,
	chatPeople,
	deleteThread,
	leaveThread,
	loadThread,
	markRead,
	membershipUpdates,
	removePerson,
	renameThread,
	setNotificationLevel,
	setThreadPicture,
	setUnread
} from '#lib/server/chat/threads.js';
import {
	deleteAttachments,
	deleteMessage,
	editMessage,
	listMessages,
	olderPageStart,
	sendMessage,
	toggleMessageReaction
} from '#lib/server/chat/messages.js';
import { parseBody } from '#lib/server/posts/posts.js';
import { docResources } from '#lib/editor/doc.js';
import { resourceTitles } from '#lib/server/search/resources.js';
import { getOrg } from '#lib/server/org.js';
import { summarizeThread, summaryOffer, threadUnits } from '#lib/server/ai/summaries.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	event.depends('chat:thread');
	const thread = await loadThread(env, who, event.params.id);
	// loadThread is the access check; the work after it is independent, so it runs at once.
	const [messages, updates, chatmates, org, units, held] = await Promise.all([
		listMessages(env, who, thread, event.url.searchParams.get('from') ?? undefined),
		membershipUpdates(env, thread.id),
		// Who "Add people" offers: everyone this member may chat with who isn't here yet.
		thread.kind === 'channel' ? [] : chatPeople(env, who),
		getOrg(env),
		threadUnits(env, thread),
		heldNotifications(env, who, thread)
	]);
	const olderFrom = messages[0] ? await olderPageStart(env, thread, messages[0].id) : null;
	// The calls among the messages shown: since the first of them, or all at the start.
	const calls = await threadCalls(env, who, thread.id, olderFrom ? messages[0].createdAt : null);
	// One lookup for every mention in the messages shown. A message that arrives while the thread
	// is open comes through this load again (the hub only says the thread changed), so each
	// reader's titles are resolved for that reader.
	const resources = await resourceTitles(
		env,
		who,
		messages.flatMap((message) => (message.body ? docResources(message.body) : []))
	);
	const here = new Set(thread.people.map((p) => p.id));
	return {
		thread,
		calls,
		messages,
		resources,
		olderFrom,
		updates,
		addable: chatmates.filter((p) => !here.has(p.id)),
		canDelete: canDeleteThread(who, thread),
		viewerId: who.user.id,
		admin: who.member.role === 'admin',
		held,
		summaries: summaryOffer(env, org, units)
	};
};

async function threadAction(event: RequestEvent) {
	const env = getEnv();
	const who = requireMember(event);
	const thread = await loadThread(env, who, event.params.id);
	const data = await event.request.formData();
	const form = Object.fromEntries(data) as Record<string, string>;
	return { env, who, thread, form, data };
}

export const actions: Actions = {
	send: async (event) => {
		const { env, who, thread, form } = await threadAction(event);
		const body = parseBody(form.body);
		if ('message' in body) return fail(400, { message: body.message });
		// The page made the id, so it can swap the copy it showed at once for this one.
		await sendMessage(env, who, thread, body, form.replyTo || null, clientId(form.id));
	},
	edit: async (event) => {
		const { env, who, thread, form } = await threadAction(event);
		const body = parseBody(form.body);
		if ('message' in body) return fail(400, { message: body.message });
		await editMessage(env, who, thread, form.messageId, body);
	},
	delete: async (event) => {
		const { env, who, thread, form } = await threadAction(event);
		await deleteMessage(env, who, thread, form.messageId);
	},
	deleteAttachments: async (event) => {
		const { env, who, thread, form, data } = await threadAction(event);
		const ids = data.getAll('attachments').map(String);
		await deleteAttachments(env, who, thread, form.messageId, ids);
	},
	react: async (event) => {
		const { env, who, thread, form } = await threadAction(event);
		await toggleMessageReaction(env, who, thread, form.subjectId, form.emoji);
	},
	level: async (event) => {
		const { env, who, thread, form } = await threadAction(event);
		await setNotificationLevel(env, who, thread, form.level);
	},
	// The page asks for this when it opens, and when a message arrives while it is open. A load
	// can't mark the thread read: it also runs when a link to the thread is hovered.
	read: async (event) => {
		const { env, who, thread } = await threadAction(event);
		await markRead(env, who, thread.id);
	},
	unread: async (event) => {
		const { env, who, thread, form } = await threadAction(event);
		await setUnread(env, who, thread, form.unread === 'true');
	},
	// "Edit name and picture": a picture picked replaces the old one; removePicture clears it.
	editGroup: async (event) => {
		const { env, who, thread, form, data } = await threadAction(event);
		await renameThread(env, who, thread, form.title);
		const picture = data.get('picture');
		const refused =
			picture instanceof File && picture.size > 0
				? await setThreadPicture(env, who, thread, picture)
				: form.removePicture === 'true'
					? await setThreadPicture(env, who, thread, null)
					: null;
		if (refused) return fail(400, { editError: refused.message });
	},
	addPeople: async (event) => {
		const { env, who, thread, data } = await threadAction(event);
		const id = await addPeople(env, who, thread, data.getAll('people').map(String));
		// Adding to a DM starts a new group: go there.
		if (id !== thread.id) redirect(303, `/chat/${id}`);
	},
	removePerson: async (event) => {
		const { env, who, thread, form } = await threadAction(event);
		await removePerson(env, who, thread, form.userId);
	},
	leave: async (event) => {
		const { env, who, thread } = await threadAction(event);
		await leaveThread(env, who, thread);
		redirect(303, '/chat');
	},
	deleteThread: async (event) => {
		const { env, who, thread } = await threadAction(event);
		await deleteThread(env, who, thread);
		redirect(303, '/chat');
	},
	summarize: async (event) => {
		const { env, thread } = await threadAction(event);
		const result = await summarizeThread(env, thread);
		return 'error' in result ? fail(502, { summaryError: result.error }) : result;
	},
	notifyAnyway: async (event) => {
		const { env, who, thread } = await threadAction(event);
		await notifyAnyway(env, who, thread);
	},
	startCall: async (event) => {
		const env = getEnv();
		const who = requireMember(event);
		const thread = await loadThread(env, who, event.params.id);
		const id = await startCall(env, who, { kind: 'thread', id: thread.id });
		redirect(303, `/calls/${id}`);
	}
};
