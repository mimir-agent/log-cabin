import { error } from '@sveltejs/kit';
import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '../db';
import type { NotePermission, Role } from '../db/schema';
import type { SignedIn } from '../auth/session';
import { canSeeProject, visibleProjectIds, type ProjectView } from '../posts/access';
import { notes as strings } from '../../strings/notes';

export type NoteAccess = 'none' | NotePermission;

/** What a note's sharing says about one person, gathered by noteFacts. */
export type NoteFacts = {
	role: Role;
	isAuthor: boolean;
	/** Their note_shares row, if the note was shared with them by name. */
	share: NotePermission | null;
	/** The note's project share, and how this person sees that project. */
	projectShare: { permission: NotePermission; project: ProjectView } | null;
};

/**
 * Notes are private to their author. Sharing with a person, or with a project they can see,
 * grants view or edit. Viewers only ever view, and a share through an archived project only views.
 */
export function noteAccess(facts: NoteFacts): NoteAccess {
	const grants: NoteAccess[] = [];
	if (facts.isAuthor) grants.push('edit');
	if (facts.share) grants.push(facts.share);
	const viaProject = facts.projectShare;
	if (viaProject && canSeeProject({ role: facts.role }, viaProject.project)) {
		grants.push(viaProject.project.archivedAt === null ? viaProject.permission : 'view');
	}
	if (grants.length === 0) return 'none';
	return grants.includes('edit') && facts.role !== 'viewer' ? 'edit' : 'view';
}

type NoteRow = typeof schema.notes.$inferSelect;

/** Reads what noteAccess needs to know about one person and one note. */
export async function noteFacts(
	env: Env,
	note: NoteRow,
	person: { userId: string; role: Role }
): Promise<NoteFacts> {
	const { noteShares, projects, projectMembers } = schema;
	const share = await db(env)
		.select({ permission: noteShares.permission })
		.from(noteShares)
		.where(and(eq(noteShares.noteId, note.id), eq(noteShares.userId, person.userId)))
		.get();
	let projectShare: NoteFacts['projectShare'] = null;
	if (note.projectId && note.projectPermission !== 'none') {
		const project = await db(env)
			.select({
				private: projects.private,
				archivedAt: projects.archivedAt,
				isMember: sql<number>`${projectMembers.userId} IS NOT NULL`
			})
			.from(projects)
			.leftJoin(
				projectMembers,
				and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, person.userId))
			)
			.where(eq(projects.id, note.projectId))
			.get();
		if (!project) throw new Error(`note ${note.id} names project ${note.projectId}, which is gone`);
		projectShare = {
			permission: note.projectPermission,
			project: { ...project, isMember: !!project.isMember }
		};
	}
	return {
		role: person.role,
		isAuthor: note.authorId === person.userId,
		share: share?.permission ?? null,
		projectShare
	};
}

/**
 * What an active member may do with a note right now, by user id: for a live socket,
 * which holds only the user id. 'none' for a deactivated member or a missing note.
 */
export async function liveNoteAccess(
	env: Env,
	userId: string,
	noteId: string
): Promise<NoteAccess> {
	const { members, notes } = schema;
	const member = await db(env)
		.select({ role: members.role })
		.from(members)
		.where(and(eq(members.userId, userId), isNull(members.deactivatedAt)))
		.get();
	const note = await db(env).select().from(notes).where(eq(notes.id, noteId)).get();
	if (!member || !note) return 'none';
	return noteAccess(await noteFacts(env, note, { userId, role: member.role }));
}

/** A note and this member's access to it, 404ing when they have none. */
export async function loadNote(env: Env, who: SignedIn, noteId: string) {
	const { notes, users } = schema;
	const row = await db(env)
		.select({ note: notes, authorName: users.name })
		.from(notes)
		.innerJoin(users, eq(users.id, notes.authorId))
		.where(eq(notes.id, noteId))
		.get();
	if (!row) error(404, strings.errors.noteNotFound);
	const facts = await noteFacts(env, row.note, { userId: who.user.id, role: who.member.role });
	const access = noteAccess(facts);
	if (access === 'none') error(404, strings.errors.noteNotFound);
	return { ...row.note, authorName: row.authorName, access };
}

export type LoadedNote = Awaited<ReturnType<typeof loadNote>>;

/** Commenting and reacting, for someone who can see the note: anyone but a viewer. */
export function canDiscussNote(who: SignedIn): boolean {
	return who.member.role !== 'viewer';
}

/** A condition on notes.id: the notes this member can see. Search filters with it too. */
export function visibleNoteIds(who: { user: { id: string }; member: { role: Role } }): SQL {
	const { notes, noteShares, projects } = schema;
	const sharedByName = sql`${notes.id} IN (SELECT ${noteShares.noteId} FROM ${noteShares} WHERE ${noteShares.userId} = ${who.user.id})`;
	const sharedByProject = and(
		inArray(notes.projectPermission, ['view', 'edit']),
		sql`${notes.projectId} IN (SELECT ${projects.id} FROM ${projects} WHERE ${visibleProjectIds(who)})`
	);
	return or(eq(notes.authorId, who.user.id), sharedByName, sharedByProject) as SQL;
}
