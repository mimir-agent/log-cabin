// The notes, posts and calls a body mentions (resource mentions), as one reader may see them.
// A document holds only each target's kind and id; its title is looked up here for every
// reader, so a renamed target shows its new title and a reader who can't see it learns nothing.
import { and, sql, type Column } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import { visibleProjectIds } from '../posts/access';
import { visibleNoteIds } from '../notes/access';
import { visibleCalls } from '../calls/history';
import { search } from './search';
import {
	resourceKey,
	resourceKinds,
	type ResourceKind,
	type ResourceRef,
	type ResourceTitles
} from '../../editor/doc';
import type { ResourceItem } from '../../editor/extensions';
import { markedParts, untitled } from '../../search';

/** The most the @ list offers at once. */
export const maxResourceResults = 10;

/**
 * The titles and pages of the mentioned targets this person may see, by resourceKey; any
 * other target, including one that no longer exists, is left out. The same rules as search:
 * visibleNoteIds, visibleProjectIds for a post's project, visibleCalls.
 */
export async function resourceTitles(
	env: Env,
	who: SignedIn,
	refs: ResourceRef[]
): Promise<ResourceTitles> {
	const { notes, posts, projects, calls } = schema;
	const ids = (kind: ResourceKind) => refs.filter((ref) => ref.kind === kind).map((ref) => ref.id);
	// The ids go in as one JSON parameter, since a body may mention more than D1 binds.
	const among = (column: Column, kind: ResourceKind) =>
		sql`${column} IN (SELECT value FROM json_each(${JSON.stringify(ids(kind))}))`;
	const none: { id: string; title: string | null }[] = [];
	const [foundNotes, foundPosts, foundCalls] = await Promise.all([
		ids('note').length
			? db(env)
					.select({ id: notes.id, title: notes.title })
					.from(notes)
					.where(and(among(notes.id, 'note'), visibleNoteIds(who)))
			: none,
		ids('post').length
			? db(env)
					.select({ id: posts.id, title: posts.title })
					.from(posts)
					.where(
						and(
							among(posts.id, 'post'),
							sql`${posts.projectId} IN (SELECT ${projects.id} FROM ${projects} WHERE ${visibleProjectIds(who)})`
						)
					)
			: none,
		ids('call').length
			? db(env)
					.select({ id: calls.id, title: calls.title })
					.from(calls)
					.where(and(among(calls.id, 'call'), visibleCalls(env, who)))
			: none
	]);
	const titles: ResourceTitles = {};
	const add = (kind: ResourceKind, rows: { id: string; title: string | null }[]) => {
		for (const { id, title } of rows) {
			titles[resourceKey({ kind, id })] = {
				title: title || untitled(kind),
				url: `/${kind}s/${id}`
			};
		}
	};
	add('note', foundNotes);
	add('post', foundPosts);
	add('call', foundCalls);
	return titles;
}

/** The notes, posts and calls this person may see that match what they typed after @. */
export async function findResources(
	env: Env,
	who: SignedIn,
	query: string
): Promise<ResourceItem[]> {
	const hits = await search(env, who, query, { kind: resourceKinds, limit: maxResourceResults });
	return hits.map((hit) => ({
		kind: hit.kind as ResourceKind,
		id: hit.id,
		title:
			markedParts(hit.title)
				.map((part) => part.text)
				.join('') || untitled(hit.kind)
	}));
}
