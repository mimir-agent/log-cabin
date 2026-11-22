import { and, desc, eq, inArray, isNotNull, isNull, or, sql, type SQLWrapper } from 'drizzle-orm';
import type { SignedIn } from '../auth/session';
import { db, schema } from '../db';
import type { NotificationKind } from '../db/schema/notifications';
import { visibleProjectIds } from '../posts/access';
import { publishUnreadCount } from './notify';

export const inboxTabs = ['unread', 'read', 'archived'] as const;
export type InboxTab = (typeof inboxTabs)[number];

export type InboxItem = {
	itemKey: string;
	kind: NotificationKind;
	url: string;
	title: string | null;
	/** The sentence the row reads; null for a notification made without one (see `notifications.summary`). */
	summary: string | null;
	/** A reaction's emoji, which the row's badge shows. */
	emoji: string | null;
	actorName: string;
	createdAt: number;
	/** The latest notification was made while a schedule or pause held push and email. */
	held: boolean;
	/** Notifications about this item in this tab, the latest included. */
	count: number;
	/** The post the item opens, when it opens one that still exists and the reader can see. */
	postId: string | null;
	/** The project that post is in, as Campsite names the place on each row; null otherwise. */
	place: { name: string; private: boolean } | null;
	/** One line under the title: for a post, its text or latest comment (see `previewOf`). */
	preview: string | null;
};

/**
 * Campsite's preview rule for a post's row: the latest comment once the reader has seen the
 * post, otherwise the post's own text. In the inbox, an item is seen once it's out of Unread.
 */
export function previewOf(
	post: { text: string; latestComment: { authorName: string; text: string } | null },
	seen: boolean
): string | null {
	const comment = post.latestComment;
	if (seen && comment) return `${comment.authorName}: ${comment.text}`;
	return post.text || null;
}

/** The id of the post a notification's URL opens, or null when it opens something else. */
export const postIdOf = (url: string) => /^\/posts\/([^/?#]+)/.exec(url)?.[1] ?? null;

/** Enough of a text for one line of a row; the row's CSS cuts it to fit. */
const oneLine = (column: SQLWrapper) => sql<string>`substr(${column}, 1, 280)`;

/** A list of ids as one bound parameter, since D1 binds at most 100 per statement. */
const idList = (ids: string[]) => sql`(select value from json_each(${JSON.stringify(ids)}))`;

/**
 * What each post the inbox lists needs for its row: its place, its text and its latest comment.
 * Only posts `who` can see: a notification outlives its reader's access to the post.
 */
async function postsFor(env: Env, who: SignedIn, ids: string[]) {
	const { comments, posts, projects, users } = schema;
	const rows = await db(env)
		.select({
			id: posts.id,
			text: oneLine(posts.bodyText),
			projectName: projects.name,
			private: projects.private
		})
		.from(posts)
		.innerJoin(projects, eq(projects.id, posts.projectId))
		.where(and(inArray(posts.id, idList(ids)), visibleProjectIds(who)));
	const latest = await db(env)
		.select({ postId: comments.postId, text: oneLine(comments.bodyText), authorName: users.name })
		.from(comments)
		.innerJoin(users, eq(users.id, comments.authorId))
		.where(
			and(
				inArray(comments.postId, idList(rows.map((row) => row.id))),
				eq(
					comments.createdAt,
					sql`(select max(c.created_at) from comments c where c.post_id = ${comments.postId})`
				)
			)
		);
	const comment = new Map(latest.map((row) => [row.postId, row]));
	return new Map(
		rows.map((row) => [row.id, { ...row, latestComment: comment.get(row.id) ?? null }])
	);
}

function inTab(tab: InboxTab) {
	const { notifications } = schema;
	switch (tab) {
		case 'unread':
			return and(isNull(notifications.readAt), isNull(notifications.archivedAt));
		case 'read':
			return and(isNotNull(notifications.readAt), isNull(notifications.archivedAt));
		case 'archived':
			return isNotNull(notifications.archivedAt);
	}
}

/** A person's inbox tab, one entry per item, newest first, led by its latest notification. */
export async function listInbox(env: Env, who: SignedIn, tab: InboxTab): Promise<InboxItem[]> {
	const { notifications, users } = schema;
	const rows = await db(env)
		.select({
			itemKey: notifications.itemKey,
			kind: notifications.kind,
			url: notifications.url,
			title: notifications.title,
			summary: notifications.summary,
			emoji: notifications.emoji,
			actorName: users.name,
			createdAt: notifications.createdAt,
			heldAt: notifications.heldAt
		})
		.from(notifications)
		.innerJoin(users, eq(users.id, notifications.actorId))
		.where(and(eq(notifications.userId, who.user.id), inTab(tab)))
		.orderBy(desc(notifications.createdAt), desc(notifications.id))
		.limit(200);
	const groups = Map.groupBy(rows, (row) => row.itemKey);
	const latest = [...groups.values()].map(([{ heldAt, ...first }, ...rest]) => ({
		...first,
		held: heldAt !== null,
		count: rest.length + 1
	}));
	const ids = [...new Set(latest.map((item) => postIdOf(item.url)).filter((id) => id !== null))];
	const posts = await postsFor(env, who, ids);
	return latest.map((item) => {
		const post = posts.get(postIdOf(item.url) ?? '');
		return {
			...item,
			postId: post ? post.id : null,
			place: post ? { name: post.projectName, private: post.private } : null,
			preview: post ? previewOf(post, tab !== 'unread') : null
		};
	});
}

/** Marks one item's notifications read, or all of them when itemKey is null. */
export async function markRead(env: Env, userId: string, itemKey: string | null, now = Date.now()) {
	const { notifications } = schema;
	await db(env)
		.update(notifications)
		.set({ readAt: now })
		.where(
			and(
				eq(notifications.userId, userId),
				isNull(notifications.readAt),
				itemKey === null ? undefined : eq(notifications.itemKey, itemKey)
			)
		);
	await publishUnreadCount(env, userId);
}

/** The inbox shows a post in its pane at /inbox/posts/<id>; it is the post's own page. */
export const itemPath = (pathname: string) => pathname.replace(/^\/inbox(?=\/posts\/)/, '');

/** The notifications whose link opens the page at `path`, with or without a ? or # after it. */
function linkingTo(path: string) {
	const { notifications } = schema;
	return or(
		eq(notifications.url, path),
		sql`substr(${notifications.url}, 1, ${path.length + 1}) in (${path + '#'}, ${path + '?'})`
	);
}

export type InboxAbout = {
	path: string;
	/** The inbox items, not archived, that are about the page. */
	itemKeys: string[];
	unread: boolean;
};

/** What the inbox holds about the page at `path`, for its reader to read or mark done. */
export async function inboxAbout(env: Env, userId: string, path: string): Promise<InboxAbout> {
	const { notifications } = schema;
	const rows = await db(env)
		.select({ itemKey: notifications.itemKey, readAt: notifications.readAt })
		.from(notifications)
		.where(
			and(eq(notifications.userId, userId), isNull(notifications.archivedAt), linkingTo(path))
		);
	return {
		path,
		itemKeys: [...new Set(rows.map((row) => row.itemKey))].sort(),
		unread: rows.some((row) => row.readAt === null)
	};
}

/** Marks read every notification about the page at `path`, whichever item it belongs to. */
export async function markReadAbout(env: Env, userId: string, path: string, now = Date.now()) {
	const { notifications } = schema;
	const changed = await db(env)
		.update(notifications)
		.set({ readAt: now })
		.where(and(eq(notifications.userId, userId), isNull(notifications.readAt), linkingTo(path)))
		.returning({ id: notifications.id });
	if (changed.length) await publishUnreadCount(env, userId);
}

/** Archives every notification about the page at `path`; that also reads them. */
export async function archiveAbout(env: Env, userId: string, path: string, now = Date.now()) {
	const { notifications } = schema;
	const changed = await db(env)
		.update(notifications)
		.set({ archivedAt: now, readAt: sql`coalesce(${notifications.readAt}, ${now})` })
		.where(and(eq(notifications.userId, userId), isNull(notifications.archivedAt), linkingTo(path)))
		.returning({ id: notifications.id });
	if (changed.length) await publishUnreadCount(env, userId);
}

/** Archives one item's notifications; archiving also counts as reading them. */
export async function archive(env: Env, userId: string, itemKey: string, now = Date.now()) {
	const { notifications } = schema;
	await db(env)
		.update(notifications)
		.set({ archivedAt: now, readAt: sql`coalesce(${notifications.readAt}, ${now})` })
		.where(and(eq(notifications.userId, userId), eq(notifications.itemKey, itemKey)));
	await publishUnreadCount(env, userId);
}
