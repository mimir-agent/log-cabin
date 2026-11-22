import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, max, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { PinSubject } from '../db/schema';
import { newId } from '../id';
import { publish } from '../realtime/publish';
import type { SignedIn } from '../auth/session';
import { visibleNoteIds } from '../notes/access';
import { publishNoteTimeline, recordNoteEvent } from '../notes/timeline';
import { posts as strings } from '../../strings/posts';
import { canSeeProjectById, canWriteInProject, loadProject, loadWritableProject } from './access';

/** Whether a post, a note shared with the project, or a call held in it belongs to the project. */
async function inProject(env: Env, projectId: string, type: PinSubject, id: string) {
	const { posts, notes, calls } = schema;
	const query =
		type === 'post'
			? db(env)
					.select({ id: posts.id })
					.from(posts)
					.where(and(eq(posts.id, id), eq(posts.projectId, projectId)))
			: type === 'note'
				? db(env)
						.select({ id: notes.id })
						.from(notes)
						.where(
							and(
								eq(notes.id, id),
								eq(notes.projectId, projectId),
								ne(notes.projectPermission, 'none')
							)
						)
				: db(env)
						.select({ id: calls.id })
						.from(calls)
						.where(and(eq(calls.id, id), eq(calls.projectId, projectId)));
	return !!(await query.get());
}

/** Pins a post, note or call to the project's top, after the pins already there. */
export async function pinToProject(
	env: Env,
	who: SignedIn,
	projectId: string,
	subject: { type: PinSubject; id: string }
) {
	await loadWritableProject(env, who, projectId);
	if (!(await inProject(env, projectId, subject.type, subject.id))) {
		error(404, strings.errors.pinNotInProject);
	}
	const { projectPins } = schema;
	const last = await db(env)
		.select({ position: max(projectPins.position) })
		.from(projectPins)
		.where(eq(projectPins.projectId, projectId))
		.get();
	const pinned = await db(env)
		.insert(projectPins)
		.values({
			id: newId(),
			projectId,
			subjectType: subject.type,
			subjectId: subject.id,
			pinnedBy: who.user.id,
			position: (last?.position ?? -1) + 1,
			createdAt: Date.now()
		})
		// Pinning something already pinned (two tabs, a double click) leaves it where it is.
		.onConflictDoNothing()
		.returning({ id: projectPins.id });
	await publish(env, `project:${projectId}`, { type: 'pins.changed' });
	if (pinned.length > 0) await recordPinOnNoteTimeline(env, who, 'pinned', projectId, subject);
}

export async function unpinFromProject(
	env: Env,
	who: SignedIn,
	projectId: string,
	subject: { type: PinSubject; id: string }
) {
	await loadWritableProject(env, who, projectId);
	const { projectPins } = schema;
	const unpinned = await db(env)
		.delete(projectPins)
		.where(
			and(
				eq(projectPins.projectId, projectId),
				eq(projectPins.subjectType, subject.type),
				eq(projectPins.subjectId, subject.id)
			)
		)
		.returning({ id: projectPins.id });
	await publish(env, `project:${projectId}`, { type: 'pins.changed' });
	if (unpinned.length > 0) await recordPinOnNoteTimeline(env, who, 'unpinned', projectId, subject);
}

/** A note's pin or unpin goes on its timeline, and to those with it open; other subjects have none. */
async function recordPinOnNoteTimeline(
	env: Env,
	who: SignedIn,
	kind: 'pinned' | 'unpinned',
	projectId: string,
	subject: { type: PinSubject; id: string }
) {
	if (subject.type !== 'note') return;
	await recordNoteEvent(env, subject.id, who.user.id, { kind, projectId });
	await publishNoteTimeline(env, subject.id);
}

export type Pin = { type: PinSubject; id: string; title: string; at: number };

/** The project's pins in order, leaving out notes no longer shared with it or hidden from this member. */
export async function projectPins(env: Env, who: SignedIn, projectId: string): Promise<Pin[]> {
	const { projectPins: pins, posts, notes, calls } = schema;
	const rows = await db(env)
		.select({ type: pins.subjectType, id: pins.subjectId })
		.from(pins)
		.where(eq(pins.projectId, projectId))
		.orderBy(asc(pins.position));
	const ids = (type: PinSubject) => rows.filter((r) => r.type === type).map((r) => r.id);
	const found = new Map<string, Pin>();
	const add = (type: PinSubject, list: { id: string; title: string; at: number }[]) => {
		for (const item of list) found.set(`${type}:${item.id}`, { type, ...item });
	};
	add(
		'post',
		await db(env)
			.select({ id: posts.id, title: posts.title, at: posts.createdAt })
			.from(posts)
			.where(inArray(posts.id, ids('post')))
	);
	add(
		'note',
		await db(env)
			.select({ id: notes.id, title: notes.title, at: notes.updatedAt })
			.from(notes)
			.where(
				and(
					inArray(notes.id, ids('note')),
					eq(notes.projectId, projectId),
					ne(notes.projectPermission, 'none'),
					visibleNoteIds(who)
				)
			)
	);
	add(
		'call',
		await db(env)
			.select({ id: calls.id, title: sql<string>`''`, at: calls.startedAt })
			.from(calls)
			.where(inArray(calls.id, ids('call')))
	);
	return rows.flatMap((r) => found.get(`${r.type}:${r.id}`) ?? []);
}

/**
 * What a post, note or call page needs for its pin button: the project it can be pinned to
 * and whether it is, or null when it isn't in a project or this member can't pin there.
 */
export async function pinState(
	env: Env,
	who: SignedIn,
	projectId: string | null,
	subject: { type: PinSubject; id: string }
) {
	if (!projectId || !(await canSeeProjectById(env, who.member, who.user.id, projectId))) {
		return null;
	}
	const project = await loadProject(env, who, projectId);
	if (!canWriteInProject(who.member, project)) return null;
	const { projectPins } = schema;
	const pin = await db(env)
		.select({ id: projectPins.id })
		.from(projectPins)
		.where(
			and(
				eq(projectPins.projectId, project.id),
				eq(projectPins.subjectType, subject.type),
				eq(projectPins.subjectId, subject.id)
			)
		)
		.get();
	return { projectId: project.id, pinned: !!pin };
}
