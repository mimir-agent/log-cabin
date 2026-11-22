import { error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { getEnv } from '#lib/server/platform.js';
import {
	archive,
	archiveAbout,
	itemPath,
	markRead,
	markReadAbout
} from '#lib/server/notifications/inbox.js';
import { dismissFeedbackRequest, feedbackRequestIdOf } from '#lib/server/posts/feedback.js';
import { finishFollowUp, followUpIdOf, snoozeFollowUp } from '#lib/server/follow-ups.js';
import { notifications } from '#lib/strings/notifications.js';
import type { Actions } from './$types';

async function itemKey(request: Request): Promise<string> {
	const value = (await request.formData()).get('item');
	if (typeof value !== 'string' || !value) error(400, notifications.errors.itemMissing);
	return value;
}

/** The page the form is sent from, as an address on this site: "/posts/p1". */
async function pagePath(request: Request): Promise<string> {
	const value = (await request.formData()).get('path');
	if (typeof value !== 'string' || !value.startsWith('/'))
		error(400, notifications.errors.pageMissing);
	return itemPath(value);
}

export const actions: Actions = {
	read: async (event) => {
		const { user } = requireMember(event);
		await markRead(getEnv(), user.id, await itemKey(event.request));
	},
	/** Opening a page reads what the inbox holds about it. The page sends this once it's shown. */
	readAbout: async (event) => {
		const { user } = requireMember(event);
		await markReadAbout(getEnv(), user.id, await pagePath(event.request));
	},
	/** Mark done, from the page itself: archives what the inbox holds about it. */
	doneAbout: async (event) => {
		const { user } = requireMember(event);
		await archiveAbout(getEnv(), user.id, await pagePath(event.request));
	},
	readAll: async (event) => {
		const { user } = requireMember(event);
		await markRead(getEnv(), user.id, null);
	},
	archive: async (event) => {
		const { user } = requireMember(event);
		await archive(getEnv(), user.id, await itemKey(event.request));
	},
	/** Declines a feedback request from its inbox item. */
	dismissFeedback: async (event) => {
		const { user } = requireMember(event);
		const key = await itemKey(event.request);
		await dismissFeedbackRequest(getEnv(), user.id, feedbackRequestIdOf(key));
	},
	/** Finishes a due reminder from its inbox item. */
	finishReminder: async (event) => {
		const { user } = requireMember(event);
		const key = await itemKey(event.request);
		await finishFollowUp(getEnv(), user.id, followUpIdOf(key));
	},
	snoozeReminder: async (event) => {
		const { user } = requireMember(event);
		const form = await event.request.formData();
		const id = followUpIdOf(String(form.get('item')));
		await snoozeFollowUp(
			getEnv(),
			user.id,
			id,
			Number(form.get('showAt')),
			form.get('notifyAnyway') === 'on'
		);
	}
};
