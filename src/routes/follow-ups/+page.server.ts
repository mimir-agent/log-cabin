import { error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { getEnv } from '#lib/server/platform.js';
import { followUpSubjects, type FollowUpSubject } from '#lib/server/db/schema/follow-ups.js';
import {
	finishFollowUp,
	setFollowUp,
	snoozeFollowUp,
	upcomingFollowUps
} from '#lib/server/follow-ups.js';
import { posts } from '#lib/strings/posts.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { user } = requireMember(event);
	return { reminders: await upcomingFollowUps(getEnv(), user.id) };
};

// The reminder menu on posts, comments, notes and calls posts here, from their own pages.
export const actions: Actions = {
	set: async (event) => {
		const who = requireMember(event);
		const form = await event.request.formData();
		const type = String(form.get('subjectType')) as FollowUpSubject;
		if (!followUpSubjects.includes(type)) error(400, posts.errors.followUpSubjectInvalid(type));
		const subject = { type, id: String(form.get('subjectId')) };
		await setFollowUp(
			getEnv(),
			who,
			subject,
			Number(form.get('showAt')),
			form.get('notifyAnyway') === 'on'
		);
	},
	finish: async (event) => {
		const { user } = requireMember(event);
		const form = await event.request.formData();
		await finishFollowUp(getEnv(), user.id, String(form.get('id')));
	},
	snooze: async (event) => {
		const { user } = requireMember(event);
		const form = await event.request.formData();
		await snoozeFollowUp(
			getEnv(),
			user.id,
			String(form.get('id')),
			Number(form.get('showAt')),
			form.get('notifyAnyway') === 'on'
		);
	}
};
