import { getEnv } from '#lib/server/platform.js';
import { error, redirect } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { loadProject } from '#lib/server/posts/access.js';
import { setProjectCover } from '#lib/server/posts/project-cover.js';
import { getObject } from '#lib/server/storage.js';
import { core } from '#lib/strings/core.js';
import { people } from '#lib/strings/people.js';
import type { RequestHandler } from './$types';

/** The project's cover, to anyone who can see the project. */
export const GET: RequestHandler = async (event) => {
	const who = requireMember(event);
	const env = getEnv();
	const project = await loadProject(env, who, event.params.id);
	const object = project.coverKey ? await getObject(env, project.coverKey) : null;
	if (!object) error(404, core.errors.notFound);
	return new Response(object.body, {
		headers: {
			'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
			'cache-control': 'private, max-age=31536000, immutable',
			'x-content-type-options': 'nosniff'
		}
	});
};

/** A new cover from the project page's form; back to the project after. */
export const POST: RequestHandler = async (event) => {
	const who = requireMember(event);
	const env = getEnv();
	const project = await loadProject(env, who, event.params.id);
	const file = (await event.request.formData()).get('cover');
	if (!(file instanceof File) || file.size === 0) error(400, people.projectCover.errors.missing);
	const saved = await setProjectCover(env, who, project, file);
	if (!saved.ok) error(400, saved.message);
	redirect(303, `/projects/${project.id}`);
};
