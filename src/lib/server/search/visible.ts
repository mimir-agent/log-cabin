import { sql, type SQL } from 'drizzle-orm';
import { schema } from '../db';
import type { SignedIn } from '../auth/session';
import { visibleProjectIds } from '../posts/access';
import { visibleNoteIds } from '../notes/access';
import { visibleCalls } from '../calls/history';

/**
 * Which members this member may find, as a condition on the members table: every active one,
 * for anyone but a guest (guests have no directory).
 */
export function visibleMembers(who: SignedIn): SQL {
	const { members } = schema;
	return who.member.role === 'guest' ? sql`0` : sql`${members.deactivatedAt} IS NULL`;
}

/**
 * Which index rows this member may see, by each row's visibility: members by visibleMembers,
 * project rows by visibleProjectIds, notes by visibleNoteIds, messages to the members of their
 * thread, calls by visibleCalls. Rows of any other visibility match nothing. The condition
 * reads the row's columns through the alias `s`, so the caller's query must name the table
 * `search_index s`.
 */
export function visibleRows(env: Env, who: SignedIn): SQL {
	const { projects, notes, members, messages, chatThreadMembers: tm, calls } = schema;
	return sql`(
		(s.visibility = 'org' AND s.kind = 'member' AND s.ref_id IN (SELECT ${members.id} FROM ${members} WHERE ${visibleMembers(who)}))
		OR (s.visibility = 'project' AND s.project_id IN (SELECT ${projects.id} FROM ${projects} WHERE ${visibleProjectIds(who)}))
		OR (s.visibility = 'note' AND s.ref_id IN (SELECT ${notes.id} FROM ${notes} WHERE ${visibleNoteIds(who)}))
		OR (s.visibility = 'thread' AND s.ref_id IN (
			SELECT ${messages.id} FROM ${messages} JOIN ${tm} ON ${tm.threadId} = ${messages.threadId}
			WHERE ${tm.userId} = ${who.user.id} AND ${messages.deletedAt} IS NULL
		))
		OR (s.visibility = 'call' AND s.ref_id IN (SELECT ${calls.id} FROM ${calls} WHERE ${visibleCalls(env, who)}))
	)`;
}
