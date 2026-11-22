import { error, fail, redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { startCall } from '#lib/server/calls/calls.js';
import { channelThreadId } from '#lib/server/chat/channels.js';
import { placeCalls } from '#lib/server/calls/history.js';
import {
	canManageProject,
	canUpdateProject,
	canWriteInProject,
	loadProject
} from '#lib/server/posts/access.js';
import { feed } from '#lib/server/posts/posts.js';
import { projectCoverUrl } from '#lib/server/posts/project-cover.js';
import { pinToProject, projectPins, unpinFromProject } from '#lib/server/posts/pins.js';
import {
	addBookmark,
	moveBookmark,
	parseBookmark,
	projectBookmarks,
	removeBookmark,
	updateBookmark
} from '#lib/server/posts/bookmarks.js';
import { pinSubjects, type PinSubject } from '#lib/server/db/schema/index.js';
import { posts as strings } from '#lib/strings/posts.js';
import {
	joinProject,
	removeProjectMember,
	setProjectArchived,
	setProjectFavorite,
	updateProject
} from '#lib/server/posts/projects.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async (event) => {
	const who = requireMember(event);
	const env = getEnv();
	event.depends('calls:place');
	const project = await loadProject(env, who, event.params.id);
	return {
		project,
		coverUrl: projectCoverUrl(project),
		calls: await placeCalls(env, who, { kind: 'project', id: project.id }),
		canJoin: !project.isMember && !project.private && who.member.role !== 'guest',
		chatThreadId: await channelThreadId(env, who, project.id),
		canManage: canManageProject(who, project),
		canUpdate: canUpdateProject(who, project),
		canWrite: canWriteInProject(who.member, project),
		pins: await projectPins(env, who, project.id),
		bookmarks: await projectBookmarks(env, project.id),
		feed: await feed(env, who, {
			projectId: project.id,
			cursor: event.url.searchParams.get('cursor')
		})
	};
};

async function signedInWithProject(event: RequestEvent) {
	const who = requireMember(event);
	const env = getEnv();
	return { env, who, project: await loadProject(env, who, event.params.id) };
}

/** The post, note or call a pin form names. */
async function pinSubject(event: RequestEvent) {
	const form = await event.request.formData();
	const type = String(form.get('subjectType'));
	if (!pinSubjects.includes(type as PinSubject)) error(400, strings.errors.pinKindInvalid(type));
	return { type: type as PinSubject, id: String(form.get('subjectId')) };
}

export const actions: Actions = {
	join: async (event) => {
		const { env, who, project } = await signedInWithProject(event);
		await joinProject(env, who, project);
	},
	leave: async (event) => {
		const { env, who, project } = await signedInWithProject(event);
		await removeProjectMember(env, who, project, who.user.id);
		// A private project disappears for whoever leaves it.
		if (project.private) redirect(303, '/projects');
	},
	favorite: async (event) => {
		const { env, who, project } = await signedInWithProject(event);
		await setProjectFavorite(env, who, project, true);
	},
	unfavorite: async (event) => {
		const { env, who, project } = await signedInWithProject(event);
		await setProjectFavorite(env, who, project, false);
	},
	archive: async (event) => {
		const { env, who, project } = await signedInWithProject(event);
		await setProjectArchived(env, who, project, true);
	},
	unarchive: async (event) => {
		const { env, who, project } = await signedInWithProject(event);
		await setProjectArchived(env, who, project, false);
	},
	update: async (event) => {
		const { env, who, project } = await signedInWithProject(event);
		const form = await event.request.formData();
		const updated = await updateProject(env, who, project, {
			name: String(form.get('name') ?? ''),
			description: String(form.get('description') ?? ''),
			accessory: String(form.get('accessory') ?? ''),
			private: form.get('private') === 'true'
		});
		if (!updated.ok) return fail(400, { settingsError: updated.message });
	},
	startCall: async (event) => {
		const { env, who, project } = await signedInWithProject(event);
		const id = await startCall(env, who, { kind: 'project', id: project.id });
		redirect(303, `/calls/${id}`);
	},
	pin: async (event) => {
		const who = requireMember(event);
		await pinToProject(getEnv(), who, event.params.id, await pinSubject(event));
	},
	unpin: async (event) => {
		const who = requireMember(event);
		await unpinFromProject(getEnv(), who, event.params.id, await pinSubject(event));
	},
	addBookmark: async (event) => {
		const who = requireMember(event);
		const parsed = parseBookmark(await event.request.formData());
		if ('message' in parsed) return fail(400, { bookmarkError: parsed.message });
		await addBookmark(getEnv(), who, event.params.id, parsed.input);
	},
	editBookmark: async (event) => {
		const who = requireMember(event);
		const form = await event.request.formData();
		const parsed = parseBookmark(form);
		if ('message' in parsed) return fail(400, { bookmarkEditError: parsed.message });
		await updateBookmark(
			getEnv(),
			who,
			event.params.id,
			String(form.get('bookmarkId')),
			parsed.input
		);
	},
	removeBookmark: async (event) => {
		const who = requireMember(event);
		const form = await event.request.formData();
		await removeBookmark(getEnv(), who, event.params.id, String(form.get('bookmarkId')));
	},
	moveBookmark: async (event) => {
		const who = requireMember(event);
		const form = await event.request.formData();
		const direction = String(form.get('direction'));
		if (direction !== 'up' && direction !== 'down') {
			error(400, strings.errors.bookmarkDirectionInvalid(direction));
		}
		await moveBookmark(getEnv(), who, event.params.id, String(form.get('bookmarkId')), direction);
	}
};
