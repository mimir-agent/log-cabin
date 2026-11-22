import { error } from '@sveltejs/kit';
import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Role } from '../db/schema';
import type { SignedIn } from '../auth/session';
import { hasRole } from '../../roles';
import { posts as strings } from '../../strings/posts';

/** A project as one member sees it: isMember says whether they have a project_members row. */
export type ProjectView = { private: boolean; archivedAt: number | null; isMember: boolean };

/**
 * Admins, members and viewers see every public project. Private projects, and every
 * project for a guest, need a project_members row.
 */
export function canSeeProject(member: { role: Role }, project: ProjectView): boolean {
	if (project.isMember) return true;
	return member.role !== 'guest' && !project.private;
}

/** Posting, commenting, reacting and uploading. Viewers never write; archived projects are read-only. */
export function canWriteInProject(member: { role: Role }, project: ProjectView): boolean {
	return member.role !== 'viewer' && project.archivedAt === null && canSeeProject(member, project);
}

/** A condition on projects.id: the projects this person can see. */
export function visibleProjectIds(who: { user: { id: string }; member: { role: Role } }): SQL {
	const { projects, projectMembers } = schema;
	const membership = sql`${projects.id} IN (SELECT ${projectMembers.projectId} FROM ${projectMembers} WHERE ${projectMembers.userId} = ${who.user.id})`;
	return who.member.role === 'guest'
		? membership
		: (or(eq(projects.private, false), membership) as SQL);
}

/** Loads a project for this member, 404ing when it doesn't exist or they can't see it. */
export async function loadProject(env: Env, who: SignedIn, projectId: string) {
	const { projects, projectMembers, projectFavorites } = schema;
	const row = await db(env)
		.select({
			project: projects,
			isMember: sql<number>`${projectMembers.userId} IS NOT NULL`,
			isFavorite: sql<number>`${projectFavorites.userId} IS NOT NULL`
		})
		.from(projects)
		.leftJoin(
			projectMembers,
			and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, who.user.id))
		)
		.leftJoin(
			projectFavorites,
			and(eq(projectFavorites.projectId, projects.id), eq(projectFavorites.userId, who.user.id))
		)
		.where(eq(projects.id, projectId))
		.get();
	if (!row) error(404, strings.errors.projectNotFound);
	const project = { ...row.project, isMember: !!row.isMember, isFavorite: !!row.isFavorite };
	if (!canSeeProject(who.member, project)) error(404, strings.errors.projectNotFound);
	return project;
}

export type LoadedProject = Awaited<ReturnType<typeof loadProject>>;

/** Like loadProject, then 403s unless this member may write in it. */
export async function loadWritableProject(env: Env, who: SignedIn, projectId: string) {
	const project = await loadProject(env, who, projectId);
	if (!canWriteInProject(who.member, project)) error(403, strings.errors.cannotWrite);
	return project;
}

/** canSeeProject for a project known only by id; false when it doesn't exist. */
export async function canSeeProjectById(
	env: Env,
	member: { role: Role },
	userId: string,
	projectId: string
) {
	const { projects, projectMembers } = schema;
	const row = await db(env)
		.select({
			private: projects.private,
			archivedAt: projects.archivedAt,
			isMember: sql<number>`${projectMembers.userId} IS NOT NULL`
		})
		.from(projects)
		.leftJoin(
			projectMembers,
			and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId))
		)
		.where(eq(projects.id, projectId))
		.get();
	return !!row && canSeeProject(member, { ...row, isMember: !!row.isMember });
}

/** Admins and the project's creator manage it: settings, members, archiving. */
export function canManageProject(who: SignedIn, project: { createdBy: string }): boolean {
	return who.member.role === 'admin' || project.createdBy === who.user.id;
}

/** project_policy.rb#update?: anyone who can see the project and is not a guest changes its settings; viewers included, as in Campsite's role table. */
export function canUpdateProject(who: SignedIn, project: ProjectView): boolean {
	return who.member.role !== 'guest' && canSeeProject(who.member, project);
}

/** Anyone who belongs to a project, and its managers, add people to it; viewers and guests never do. */
export function canAddPeople(
	who: SignedIn,
	project: { isMember: boolean; createdBy: string }
): boolean {
	return hasRole(who.member.role, 'member') && (project.isMember || canManageProject(who, project));
}
