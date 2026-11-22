import { error } from '@sveltejs/kit';
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { emit } from '../events';
import { dropFromChannel } from '../chat/channels';
import { newId } from '../id';
import type { SignedIn } from '../auth/session';
import { posts as strings } from '../../strings/posts';
import {
	canAddPeople,
	canManageProject,
	canUpdateProject,
	loadWritableProject,
	visibleProjectIds,
	type LoadedProject
} from './access';

/** chat: make the project with its chat channel, shared by its members. */
export type ProjectInput = { name: string; description: string; private: boolean; chat?: boolean };

export function validateProjectInput(
	form: Record<string, FormDataEntryValue>
): { ok: true; input: ProjectInput } | { ok: false; message: string } {
	const name = String(form.name ?? '').trim();
	if (!name) return { ok: false, message: strings.errors.projectNameMissing };
	if (name.length > 80) return { ok: false, message: strings.errors.projectNameTooLong };
	return {
		ok: true,
		input: {
			name,
			description: String(form.description ?? '').trim(),
			private: !!form.private,
			chat: !!form.chat
		}
	};
}

/** Members and admins create projects, and join the ones they create. */
export async function createProject(
	env: Env,
	who: SignedIn,
	input: ProjectInput,
	now = Date.now()
) {
	if (who.member.role !== 'admin' && who.member.role !== 'member') {
		error(403, strings.errors.cannotCreateProject);
	}
	const id = newId(now);
	const { chat, ...project } = input;
	const d = db(env);
	await d.batch([
		d.insert(schema.projects).values({ id, ...project, createdBy: who.user.id, createdAt: now }),
		// Before the creator's membership, whose trigger puts them in it. The title is '' because
		// 0005 wants one on every thread without a dm key; the channel is named by its project.
		...(chat
			? [
					d.insert(schema.chatThreads).values({
						id: newId(now),
						title: '',
						createdBy: who.user.id,
						createdAt: now,
						lastMessageAt: now,
						projectId: id
					})
				]
			: []),
		db(env)
			.insert(schema.projectMembers)
			.values({ projectId: id, userId: who.user.id, createdAt: now })
	]);
	return id;
}

/** Every project this member can see, open or archived, with their membership and star. */
export async function listProjects(env: Env, who: SignedIn, archived: boolean) {
	const { projects, projectMembers, projectFavorites } = schema;
	const rows = await db(env)
		.select({
			id: projects.id,
			name: projects.name,
			description: projects.description,
			private: projects.private,
			accessory: projects.accessory,
			createdBy: projects.createdBy,
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
		.where(
			and(
				visibleProjectIds(who),
				archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt)
			)
		)
		.orderBy(asc(projects.name));
	return rows.map((row) => ({ ...row, isMember: !!row.isMember, isFavorite: !!row.isFavorite }));
}

/** The sidebar's lists: starred projects, then the open projects this member belongs to. */
export async function sidebarProjects(env: Env, who: SignedIn) {
	const open = await listProjects(env, who, false);
	const pick = (p: { id: string; name: string; private: boolean; accessory: string | null }) => ({
		id: p.id,
		name: p.name,
		private: p.private,
		accessory: p.accessory
	});
	return {
		favorites: open.filter((p) => p.isFavorite).map(pick),
		joined: open.filter((p) => p.isMember && !p.isFavorite).map(pick)
	};
}

export async function joinProject(env: Env, who: SignedIn, project: LoadedProject) {
	// Guests only reach projects they were added to, and private ones need an invitation.
	if (who.member.role === 'guest' || project.private) error(403, strings.errors.cannotJoin);
	await db(env)
		.insert(schema.projectMembers)
		.values({ projectId: project.id, userId: who.user.id, createdAt: Date.now() })
		.onConflictDoNothing();
}

/** Anyone who belongs to a project adds people; the manager or the person themselves removes them. */
export async function addProjectMember(
	env: Env,
	who: SignedIn,
	project: LoadedProject,
	userId: string
) {
	if (!canAddPeople(who, project)) error(403, strings.errors.cannotManage);
	const target = await db(env)
		.select({ id: schema.members.id })
		.from(schema.members)
		.where(and(eq(schema.members.userId, userId), isNull(schema.members.deactivatedAt)))
		.get();
	if (!target) error(400, strings.errors.personNotFound);
	const added = await db(env)
		.insert(schema.projectMembers)
		.values({ projectId: project.id, userId, createdAt: Date.now() })
		.onConflictDoNothing()
		.returning({ userId: schema.projectMembers.userId });
	if (added.length) {
		await emit(env, {
			kind: 'project.member_added',
			projectId: project.id,
			userId,
			addedBy: who.user.id
		});
	}
}

export async function removeProjectMember(
	env: Env,
	who: SignedIn,
	project: LoadedProject,
	userId: string
) {
	if (userId !== who.user.id && !canManageProject(who, project)) {
		error(403, strings.errors.cannotManage);
	}
	const { projectMembers } = schema;
	await db(env)
		.delete(projectMembers)
		.where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)));
	await dropFromChannel(env, project.id, userId);
}

export async function setProjectArchived(
	env: Env,
	who: SignedIn,
	project: LoadedProject,
	archived: boolean
) {
	if (!canManageProject(who, project)) error(403, strings.errors.cannotManage);
	await db(env)
		.update(schema.projects)
		.set({ archivedAt: archived ? Date.now() : null })
		.where(eq(schema.projects.id, project.id));
	if (archived && project.archivedAt === null) {
		await emit(env, { kind: 'project.archived', projectId: project.id, archivedBy: who.user.id });
	}
}

/** UTF-16 units: room for any emoji sequence, too short to bloat the layout that carries it. */
const maxAccessoryLength = 16;

export type ProjectSettings = {
	name: string;
	description: string;
	/** An emoji shown before the name; empty for none. */
	accessory: string;
	private: boolean;
};

/**
 * Changes a project's name, description, emoji and privacy. Going private needs someone in it,
 * and takes it away from everyone who isn't: visibility follows projects.private.
 */
export async function updateProject(
	env: Env,
	who: SignedIn,
	project: LoadedProject,
	settings: ProjectSettings
): Promise<{ ok: true } | { ok: false; message: string }> {
	if (!canUpdateProject(who, project)) error(403, strings.channelSettings.membersOnly);
	const valid = validateProjectInput({ name: settings.name });
	if (!valid.ok) return valid;
	if (settings.accessory.trim().length > maxAccessoryLength) {
		return { ok: false, message: strings.channelSettings.accessoryTooLong };
	}
	if (settings.private && !project.private) {
		const member = await db(env)
			.select({ userId: schema.projectMembers.userId })
			.from(schema.projectMembers)
			.where(eq(schema.projectMembers.projectId, project.id))
			.get();
		if (!member) return { ok: false, message: strings.channelSettings.privateNeedsMember };
	}
	await db(env)
		.update(schema.projects)
		.set({
			name: valid.input.name,
			description: settings.description.trim(),
			accessory: settings.accessory.trim() || null,
			private: settings.private
		})
		.where(eq(schema.projects.id, project.id));
	if (valid.input.name !== project.name) {
		await emit(env, { kind: 'project.renamed', projectId: project.id, renamedBy: who.user.id });
	}
	return { ok: true };
}

export async function setProjectFavorite(
	env: Env,
	who: SignedIn,
	project: LoadedProject,
	favorite: boolean
) {
	const { projectFavorites } = schema;
	if (favorite) {
		await db(env)
			.insert(projectFavorites)
			.values({ projectId: project.id, userId: who.user.id, createdAt: Date.now() })
			.onConflictDoNothing();
	} else {
		await db(env)
			.delete(projectFavorites)
			.where(
				and(eq(projectFavorites.projectId, project.id), eq(projectFavorites.userId, who.user.id))
			);
	}
}

/** The project's people, for its members page. */
export async function projectPeople(env: Env, projectId: string) {
	const { projectMembers, users, members } = schema;
	return db(env)
		.select({ id: users.id, name: users.name, role: members.role })
		.from(projectMembers)
		.innerJoin(users, eq(users.id, projectMembers.userId))
		.innerJoin(members, eq(members.userId, users.id))
		.where(eq(projectMembers.projectId, projectId))
		.orderBy(asc(users.name));
}

/** Everyone active in the org, for the add-people picker and @mentions. */
export async function orgPeople(env: Env) {
	const { users, members } = schema;
	return db(env)
		.select({ id: users.id, name: users.name, role: members.role })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(isNull(members.deactivatedAt))
		.orderBy(asc(users.name));
}

/** Who this member may @mention in a project: a guest sees only the project's people. */
export async function mentionablePeople(env: Env, who: SignedIn, projectId: string) {
	return who.member.role === 'guest' ? projectPeople(env, projectId) : orgPeople(env);
}

/**
 * What the new-post dialog needs for a project this member can post in: the people to
 * @mention, how many guests will see the post, and the other projects it could go to.
 */
export async function composerData(env: Env, who: SignedIn, projectId: string) {
	const project = await loadWritableProject(env, who, projectId);
	const [people, mentionable, open] = await Promise.all([
		projectPeople(env, project.id),
		mentionablePeople(env, who, project.id),
		listProjects(env, who, false)
	]);
	return {
		project: { id: project.id, name: project.name },
		guests: people.filter((p) => p.role === 'guest').length,
		members: mentionable.map(({ id, name }) => ({ id, name })),
		projects: open.map(({ id, name, accessory }) => ({ id, name, accessory }))
	};
}
