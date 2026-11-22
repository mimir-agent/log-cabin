import { asc, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import { visibleProjectIds } from '../posts/access';
import { visibleNoteIds } from '../notes/access';
import { readThreadNaming, threadNaming } from '../chat/threads';
import { correctedQuery } from './correct';
import { visibleMembers, visibleRows } from './visible';
import { markEnd, markStart, type SearchKind } from '../../search';

/**
 * Turns what a person typed into an FTS5 query that can't be a syntax error: every run of
 * letters or digits becomes a quoted term, all terms must match, and the last one matches
 * as a prefix so results follow typing. Quotes, operators and punctuation are dropped.
 * Null when nothing searchable is left.
 */
export function ftsQuery(input: string): string | null {
	const terms = input.match(/[\p{L}\p{N}]+/gu);
	if (!terms) return null;
	return terms.map((term, i) => `"${term}"${i === terms.length - 1 ? '*' : ''}`).join(' ');
}

export type SearchHit = {
	kind: SearchKind;
	id: string;
	href: string;
	title: string;
	snippet: string;
	/** The project the hit is in; null for a project itself and for what's in no project. */
	projectName: string | null;
	/** Whether the hit's project, or the project hit itself, is private or archived. */
	projectPrivate: boolean;
	projectArchived: boolean;
};

function hrefFor(
	kind: SearchKind,
	id: string,
	parent: { postId: string | null; threadId: string | null }
): string {
	switch (kind) {
		case 'post':
			return `/posts/${id}`;
		case 'comment':
			return `/posts/${parent.postId}`;
		case 'message':
			return `/chat/${parent.threadId}`;
		case 'note':
			return `/notes/${id}`;
		case 'member':
			return `/members/${id}`;
		case 'project':
			return `/projects/${id}`;
		case 'call':
			return `/calls/${id}`;
	}
}

/**
 * Full-text search over search_index, best match first (bm25, titles weighted over bodies).
 * The permission filter is part of the WHERE clause, so the limit counts only rows the
 * member may see. `kind` keeps hits of that kind, or of those kinds.
 */
export async function search(
	env: Env,
	who: SignedIn,
	input: string,
	options: { kind?: SearchKind | readonly SearchKind[]; limit: number }
): Promise<SearchHit[]> {
	const match = ftsQuery(input);
	if (!match) return [];
	const kindFilter = options.kind ? sql`AND s.kind IN ${[options.kind].flat()}` : sql``;
	const rows = await db(env).all<{
		kind: SearchKind;
		id: string;
		/** For a message, its thread's threadNaming value; for the rest, the highlighted title. */
		title: string;
		snippet: string;
		projectName: string | null;
		projectPrivate: number | null;
		projectArchived: number | null;
		postId: string | null;
		threadId: string | null;
	}>(sql`
		SELECT s.kind AS kind, s.ref_id AS id,
			CASE s.kind
				WHEN 'message' THEN ${threadNaming(sql`m.thread_id`, who.user.id)}
				ELSE highlight(search_index, 5, ${markStart}, ${markEnd})
			END AS title,
			snippet(search_index, 6, ${markStart}, ${markEnd}, '…', 16) AS snippet,
			CASE WHEN s.kind = 'project' THEN NULL ELSE p.name END AS projectName,
			p.private AS projectPrivate, p.archived_at IS NOT NULL AS projectArchived,
			c.post_id AS postId, m.thread_id AS threadId
		FROM search_index s
		LEFT JOIN projects p ON p.id = s.project_id
		LEFT JOIN comments c ON s.kind = 'comment' AND c.id = s.ref_id
		LEFT JOIN messages m ON s.kind = 'message' AND m.id = s.ref_id
		WHERE search_index MATCH ${match} ${kindFilter} AND ${visibleRows(env, who)}
		ORDER BY bm25(search_index, 0, 0, 0, 0, 0, 10.0, 1.0)
		LIMIT ${options.limit}
	`);
	return rows.map(({ postId, threadId, projectPrivate, projectArchived, ...row }) => ({
		...row,
		title: row.kind === 'message' ? readThreadNaming(row.title).name : row.title,
		projectPrivate: projectPrivate === 1,
		projectArchived: projectArchived === 1,
		href: hrefFor(row.kind, row.id, { postId, threadId })
	}));
}

/**
 * search, and when that finds nothing, the same search with its misspelt words corrected
 * (correctedQuery), when the corrected one finds something this member may see. correction
 * is the corrected text then, and null otherwise.
 */
export async function searchCorrecting(
	env: Env,
	who: SignedIn,
	input: string,
	options: { kind?: SearchKind; limit: number }
): Promise<{ hits: SearchHit[]; correction: string | null }> {
	const hits = await search(env, who, input, options);
	if (hits.length) return { hits, correction: null };
	const correction = await correctedQuery(env, who, input);
	if (!correction) return { hits, correction: null };
	const corrected = await search(env, who, correction, options);
	return corrected.length ? { hits: corrected, correction } : { hits, correction: null };
}

/**
 * The people this member may find, by name, with only what a quick switcher row needs: the
 * same people search finds (visibleMembers), so the list can match them as you type.
 */
export function findablePeople(env: Env, who: SignedIn): Promise<{ id: string; name: string }[]> {
	const { members, users } = schema;
	return db(env)
		.select({ id: members.id, name: users.name })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(visibleMembers(who))
		.orderBy(asc(users.name))
		.all();
}

/** The posts and notes this member can see that changed most recently, newest first. */
export async function recentItems(env: Env, who: SignedIn, limit: number) {
	const { posts, notes, projects } = schema;
	// Independent reads, so they run at once.
	const [recentPosts, recentNotes] = await Promise.all([
		db(env)
			.select({ id: posts.id, title: posts.title, at: posts.lastActivityAt })
			.from(posts)
			.where(
				sql`${posts.projectId} IN (SELECT ${projects.id} FROM ${projects} WHERE ${visibleProjectIds(who)})`
			)
			.orderBy(desc(posts.lastActivityAt))
			.limit(limit),
		db(env)
			.select({ id: notes.id, title: notes.title, at: notes.updatedAt })
			.from(notes)
			.where(visibleNoteIds(who))
			.orderBy(desc(notes.updatedAt))
			.limit(limit)
	]);
	return [
		...recentPosts.map((p) => ({ ...p, kind: 'post' as const, href: `/posts/${p.id}` })),
		...recentNotes.map((n) => ({ ...n, kind: 'note' as const, href: `/notes/${n.id}` }))
	]
		.sort((a, b) => b.at - a.at)
		.slice(0, limit);
}
