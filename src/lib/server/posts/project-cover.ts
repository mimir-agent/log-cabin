import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import { saveImage } from '../storage';
import { canManageProject, type LoadedProject } from './access';
import { people } from '../../strings/people';

/** Where a project's cover is served: through the project, which checks who may see it. */
export function projectCoverUrl(project: { id: string; coverKey: string | null }): string | null {
	if (!project.coverKey) return null;
	// The key changes with every upload, so the browser never shows a stale cover.
	return `/projects/${project.id}/cover?v=${encodeURIComponent(project.coverKey.split('/').at(-1)!)}`;
}

/** Saves a new 3:1 cover for a project its creator or an admin manages. */
export async function setProjectCover(
	env: Env,
	who: SignedIn,
	project: LoadedProject,
	file: File
): Promise<{ ok: true } | { ok: false; message: string }> {
	if (!canManageProject(who, project)) error(403, people.projectCover.errors.notAllowed);
	const saved = await saveImage(env, `project-covers/${project.id}`, file);
	if (!saved.ok) return saved;
	await db(env)
		.update(schema.projects)
		.set({ coverKey: saved.key })
		.where(eq(schema.projects.id, project.id));
	return { ok: true };
}
