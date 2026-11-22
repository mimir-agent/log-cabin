import { error } from '@sveltejs/kit';
import {
	and,
	desc,
	eq,
	getTableColumns,
	inArray,
	isNull,
	ne,
	sql,
	type SQL,
	type SQLWrapper
} from 'drizzle-orm';
import { db, schema } from '../db';
import type { NotificationLevel, Role } from '../db/schema';
import { notificationLevels } from '../db/schema/chat';
import { newId } from '../id';
import type { SignedIn } from '../auth/session';
import { deleteObject, saveImage } from '../storage';
import { publish, unsubscribeUser } from '../realtime/publish';
import { attachmentKey } from '../posts/attachments';
import { chat as strings } from '../../strings/chat';

export type Person = { id: string; name: string };

/** A DM between two people, a group, or the one thread of a project made with "Chat format". */
export type ThreadKind = 'dm' | 'group' | 'channel';

function threadKind(thread: { dmKey: string | null; projectId: string | null }): ThreadKind {
	if (thread.dmKey !== null) return 'dm';
	return thread.projectId === null ? 'group' : 'channel';
}

/**
 * What a thread is called for one reader, as Campsite's MessageThread#formatted_title: its
 * title when it has one (a channel's is its project's name), otherwise the other people in it
 * by name: "Ada", "Ada and Bo", "Ada and 2 others".
 */
export function threadName(title: string | null, others: string[]): string {
	if (title) return title;
	const [first, second] = others;
	if (first === undefined) return strings.thread.justYou;
	if (second === undefined) return first;
	if (others.length === 2) return strings.thread.twoNames(first, second);
	return strings.thread.nameAndOthers(first, others.length - 1);
}

/**
 * SQL that reads, as JSON, what threadName needs to name a thread for this user;
 * `readThreadNaming` turns it into the name and the faces. Every place a thread's name shows
 * uses it: the chat list and page, search hits, call history and notifications.
 */
export function threadNaming(threadId: SQLWrapper, userId: string): SQL<string> {
	return sql`(SELECT json_object(
		'title', coalesce(np.name, nullif(nt.title, '')),
		'others', json((SELECT json_group_array(name) FROM (SELECT u.name FROM chat_thread_members om
			JOIN users u ON u.id = om.user_id
			WHERE om.thread_id = nt.id AND om.user_id != ${userId}
			ORDER BY u.name)))
	) FROM chat_threads nt LEFT JOIN projects np ON np.id = nt.project_id WHERE nt.id = ${threadId})`;
}

/**
 * What a threadNaming value says: the thread's name, and the first three other people by name
 * for its face (Campsite's cluster).
 */
export function readThreadNaming(naming: string): { name: string; faces: string[] } {
	const { title, others } = JSON.parse(naming) as { title: string | null; others: string[] };
	return { name: threadName(title, others), faces: others.slice(0, 3) };
}

/** Everyone in a project with this user, by user id. */
async function projectmates(env: Env, userId: string): Promise<Set<string>> {
	const rows = await db(env).all<{ user_id: string }>(
		sql`SELECT DISTINCT other.user_id FROM project_members mine
			JOIN project_members other ON other.project_id = mine.project_id
			WHERE mine.user_id = ${userId}`
	);
	return new Set(rows.map((r) => r.user_id));
}

/**
 * The active people this member may chat with. A guest chats only with people who share
 * a project with them, so a guest only shows up for those people too.
 */
export async function chatPeople(env: Env, who: SignedIn): Promise<Person[]> {
	const { members, users } = schema;
	const everyone = await db(env)
		.select({ id: users.id, name: users.name, role: members.role })
		.from(members)
		.innerJoin(users, eq(users.id, members.userId))
		.where(and(isNull(members.deactivatedAt), ne(users.id, who.user.id)))
		.orderBy(users.name);
	const mates = await projectmates(env, who.user.id);
	return everyone
		.filter((p) => mayChat(who.member.role, p.role, mates.has(p.id)))
		.map(({ id, name }) => ({ id, name }));
}

function mayChat(a: Role, b: Role, shareProject: boolean): boolean {
	return shareProject || (a !== 'guest' && b !== 'guest');
}

/** Whether "Message" shows for this person: someone else, active, whom this member may chat with. */
export async function canMessage(env: Env, who: SignedIn, userId: string): Promise<boolean> {
	return (await chatPeople(env, who)).some((p) => p.id === userId);
}

/** 403s unless every pair among these people may chat. Each must be an active member. */
async function assertCanChatTogether(env: Env, userIds: string[]) {
	const { members } = schema;
	const people = await db(env)
		.select({ id: members.userId, role: members.role })
		.from(members)
		.where(and(inArray(members.userId, userIds), isNull(members.deactivatedAt)));
	if (people.length !== userIds.length) error(400, strings.errors.personUnavailable);
	for (const guest of people.filter((p) => p.role === 'guest')) {
		const mates = await projectmates(env, guest.id);
		if (people.some((p) => p.id !== guest.id && !mates.has(p.id))) {
			error(403, strings.errors.guestOutsideProjects);
		}
	}
}

async function createThread(
	env: Env,
	who: SignedIn,
	thread: { title: string | null; dmKey: string | null },
	userIds: string[]
): Promise<string> {
	const id = newId();
	const now = Date.now();
	const d = db(env);
	await d.batch([
		d.insert(schema.chatThreads).values({
			id,
			...thread,
			createdBy: who.user.id,
			createdAt: now,
			lastMessageAt: now
		}),
		d
			.insert(schema.chatThreadMembers)
			.values(userIds.map((userId) => ({ threadId: id, userId, lastReadAt: now, createdAt: now })))
	]);
	return id;
}

/** The DM between this member and another, created the first time. */
export async function startDm(env: Env, who: SignedIn, otherId: string): Promise<string> {
	if (otherId === who.user.id) error(400, strings.errors.dmSelf);
	const pair = [who.user.id, otherId].sort();
	await assertCanChatTogether(env, pair);
	const dmKey = pair.join(':');
	const existing = await db(env)
		.select({ id: schema.chatThreads.id })
		.from(schema.chatThreads)
		.where(eq(schema.chatThreads.dmKey, dmKey))
		.get();
	return existing?.id ?? createThread(env, who, { title: null, dmKey }, pair);
}

/** A group's title as stored: trimmed, and '' for a group called by its members' names. */
function groupTitle(title: string): string {
	const name = title.trim();
	if (name.length > 100) error(400, strings.errors.titleTooLong);
	return name;
}

/** A group of this member and others. Without a title it's called by its members' names. */
export async function createGroup(
	env: Env,
	who: SignedIn,
	title: string,
	memberIds: string[]
): Promise<string> {
	const name = groupTitle(title);
	const userIds = [...new Set([who.user.id, ...memberIds])];
	if (userIds.length < 2) error(400, strings.errors.noOneElse);
	await assertCanChatTogether(env, userIds);
	return createThread(env, who, { title: name, dmKey: null }, userIds);
}

export async function isThreadMember(env: Env, threadId: string, userId: string) {
	const { chatThreadMembers: m } = schema;
	const row = await db(env)
		.select({ userId: m.userId })
		.from(m)
		.where(and(eq(m.threadId, threadId), eq(m.userId, userId)))
		.get();
	return !!row;
}

/** A thread, its people and this member's own settings for it, 404ing for anyone not in it. */
export async function loadThread(env: Env, who: SignedIn, threadId: string) {
	const { chatThreads, chatThreadMembers, users, members, projects, favorites } = schema;
	// Joining this person's membership row makes the access check part of the thread's own query.
	const row = await db(env)
		.select({
			...getTableColumns(chatThreads),
			projectName: projects.name,
			projectPrivate: projects.private,
			projectArchivedAt: projects.archivedAt,
			notificationLevel: chatThreadMembers.notificationLevel,
			favorite: sql<number>`${favorites.userId} IS NOT NULL`
		})
		.from(chatThreads)
		.innerJoin(
			chatThreadMembers,
			and(eq(chatThreadMembers.threadId, chatThreads.id), eq(chatThreadMembers.userId, who.user.id))
		)
		.leftJoin(projects, eq(projects.id, chatThreads.projectId))
		.leftJoin(
			favorites,
			and(
				eq(favorites.userId, who.user.id),
				eq(favorites.subjectType, 'thread'),
				eq(favorites.subjectId, chatThreads.id)
			)
		)
		.where(eq(chatThreads.id, threadId))
		.get();
	if (!row) error(404, strings.errors.threadNotFound);
	const { projectName, projectPrivate, projectArchivedAt, notificationLevel, favorite, ...thread } =
		row;
	const people = await db(env)
		.select({
			id: users.id,
			name: users.name,
			timezone: users.timezone,
			deactivated: sql<number>`${members.deactivatedAt} IS NOT NULL`
		})
		.from(chatThreadMembers)
		.innerJoin(users, eq(users.id, chatThreadMembers.userId))
		.innerJoin(members, eq(members.userId, users.id))
		.where(eq(chatThreadMembers.threadId, threadId))
		.orderBy(users.name);
	const others = people.filter((p) => p.id !== who.user.id);
	const kind = threadKind(thread);
	return {
		...thread,
		kind,
		people: people.map((p) => ({ ...p, deactivated: p.deactivated === 1 })),
		name: threadName(
			projectName ?? thread.title,
			others.map((p) => p.name)
		),
		/** A channel's own state, for the marks after its name; false for a DM or a group. */
		projectPrivate: !!projectPrivate,
		projectArchived: projectArchivedAt !== null,
		pictureUrl: thread.imageKey ? threadPicturePath(thread.id, thread.imageKey) : null,
		notificationLevel,
		favorite: favorite === 1
	};
}

export type LoadedThread = Awaited<ReturnType<typeof loadThread>>;

/** Where a group's picture is served, to its members only. The key's last part busts caches. */
export function threadPicturePath(threadId: string, imageKey: string): string {
	return `/chat/${threadId}/picture/${imageKey.split('/').at(-1)}`;
}

export async function markRead(env: Env, who: SignedIn, threadId: string, now = Date.now()) {
	const { chatThreadMembers: m } = schema;
	await db(env)
		.update(m)
		.set({ lastReadAt: now, markedUnread: false })
		.where(and(eq(m.threadId, threadId), eq(m.userId, who.user.id)));
}

/**
 * "Mark unread" or "Mark read" from the thread menu: unread keeps the thread's badge until
 * this member opens it again, on any device.
 */
export async function setUnread(env: Env, who: SignedIn, thread: LoadedThread, unread: boolean) {
	if (unread) {
		const { chatThreadMembers: m } = schema;
		await db(env)
			.update(m)
			.set({ markedUnread: true })
			.where(and(eq(m.threadId, thread.id), eq(m.userId, who.user.id)));
	} else {
		await markRead(env, who, thread.id);
	}
	await publish(env, `user:${who.user.id}`, { type: 'chat.threads' });
}

export async function setNotificationLevel(
	env: Env,
	who: SignedIn,
	thread: LoadedThread,
	level: string
) {
	if (!notificationLevels.includes(level as NotificationLevel)) {
		error(400, strings.errors.levelUnknown(level));
	}
	const { chatThreadMembers: m } = schema;
	await db(env)
		.update(m)
		.set({ notificationLevel: level as NotificationLevel })
		.where(and(eq(m.threadId, thread.id), eq(m.userId, who.user.id)));
}

/** This member's DMs and groups, most recent first, with the last message and unread state. */
export async function listThreads(env: Env, who: SignedIn) {
	const { chatThreads: t, chatThreadMembers: m } = schema;
	const rows = await db(env)
		.select({
			id: t.id,
			dmKey: t.dmKey,
			imageKey: t.imageKey,
			lastMessageAt: t.lastMessageAt,
			naming: threadNaming(t.id, who.user.id),
			markedUnread: m.markedUnread,
			lastText: sql<string | null>`(SELECT body_text FROM messages
				WHERE thread_id = ${t.id} AND deleted_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1)`,
			unread: unreadCount(t.id, who.user.id, m.lastReadAt)
		})
		.from(m)
		.innerJoin(t, eq(t.id, m.threadId))
		// A channel's thread is reached from its project, not from the chat list.
		.where(and(eq(m.userId, who.user.id), isNull(t.projectId)))
		.orderBy(desc(t.lastMessageAt));
	return rows.map(({ naming, dmKey, imageKey, ...row }) => ({
		...row,
		...readThreadNaming(naming),
		group: dmKey === null,
		pictureUrl: imageKey ? threadPicturePath(row.id, imageKey) : null
	}));
}

/** SQL for how many messages in a thread this user hasn't read. */
export function unreadCount(threadId: SQLWrapper, userId: string, lastReadAt: SQLWrapper) {
	return sql<number>`(SELECT count(*) FROM messages
		WHERE thread_id = ${threadId} AND deleted_at IS NULL
		AND author_id != ${userId} AND created_at > ${lastReadAt})`;
}

/** Tells the thread's open pages, and each of these people's thread lists, that it changed. */
async function announce(env: Env, threadId: string, userIds: string[], payload: { type: string }) {
	await publish(env, `thread:${threadId}`, payload);
	for (const userId of userIds) await publish(env, `user:${userId}`, { type: 'chat.threads' });
}

function everyone(thread: LoadedThread): string[] {
	return thread.people.map((p) => p.id);
}

/** What only a group allows: a name, a picture, other people, leaving (Campsite's policy). */
function assertGroup(thread: LoadedThread) {
	if (thread.kind !== 'group') error(403, strings.errors.onlyGroups);
}

/** Renames a group; an empty name goes back to calling it by its members' names. */
export async function renameThread(env: Env, who: SignedIn, thread: LoadedThread, title: string) {
	assertGroup(thread);
	await db(env)
		.update(schema.chatThreads)
		.set({ title: groupTitle(title) })
		.where(eq(schema.chatThreads.id, thread.id));
	await announce(env, thread.id, everyone(thread), { type: 'thread.updated' });
}

/** Sets a group's picture, or removes it when `file` is null. */
export async function setThreadPicture(
	env: Env,
	who: SignedIn,
	thread: LoadedThread,
	file: File | null
): Promise<{ message: string } | null> {
	assertGroup(thread);
	let key: string | null = null;
	if (file) {
		const saved = await saveImage(env, `thread-pictures/${thread.id}`, file);
		if (!saved.ok) return { message: saved.message };
		key = saved.key;
	}
	await db(env)
		.update(schema.chatThreads)
		.set({ imageKey: key })
		.where(eq(schema.chatThreads.id, thread.id));
	if (thread.imageKey) await deleteObject(env, thread.imageKey);
	await announce(env, thread.id, everyone(thread), { type: 'thread.updated' });
	return null;
}

/** The storage key of a group's picture, for one of its members; 404 when it has none. */
export async function threadPictureKey(env: Env, who: SignedIn, threadId: string, name: string) {
	const { imageKey } = await loadThread(env, who, threadId);
	if (!imageKey || imageKey.split('/').at(-1) !== name) error(404, strings.errors.noPicture);
	return imageKey;
}

function membershipUpdate(
	env: Env,
	threadId: string,
	actorId: string,
	change: { added: string[] } | { removed: string[] }
) {
	return db(env)
		.insert(schema.chatMembershipUpdates)
		.values({ id: newId(), threadId, actorId, ...change, createdAt: Date.now() });
}

/**
 * Adds people to a group; they see it and its history from then on. Everyone in it must still
 * be able to chat together (the guest rule). Adding to a DM starts a new group of all of them
 * instead, whose id is returned; otherwise it's this thread's.
 */
export async function addPeople(
	env: Env,
	who: SignedIn,
	thread: LoadedThread,
	userIds: string[]
): Promise<string> {
	if (thread.kind === 'channel') error(403, strings.errors.onlyGroups);
	const current = new Set(everyone(thread));
	const added = [...new Set(userIds)].filter((id) => !current.has(id));
	if (added.length === 0) error(400, strings.errors.noOneNew);
	const active = thread.people.filter((p) => !p.deactivated).map((p) => p.id);
	if (thread.kind === 'dm') return createGroup(env, who, '', [...active, ...added]);
	await assertCanChatTogether(env, [...active, ...added]);
	const now = Date.now();
	const d = db(env);
	await d.batch([
		d
			.insert(schema.chatThreadMembers)
			.values(
				added.map((userId) => ({ threadId: thread.id, userId, lastReadAt: now, createdAt: now }))
			),
		membershipUpdate(env, thread.id, who.user.id, { added })
	]);
	await announce(env, thread.id, [...current, ...added], { type: 'thread.members' });
	return thread.id;
}

/**
 * Takes someone out of a group: the thread 404s for them from then on, their inbox rows for it
 * go, and their open pages stop hearing it.
 */
async function dropMember(env: Env, thread: LoadedThread, userId: string, actorId: string) {
	const { chatThreadMembers: m, notifications: n } = schema;
	const d = db(env);
	await d.batch([
		d.delete(m).where(and(eq(m.threadId, thread.id), eq(m.userId, userId))),
		d.delete(n).where(and(eq(n.userId, userId), eq(n.itemKey, `thread:${thread.id}`))),
		membershipUpdate(env, thread.id, actorId, { removed: [userId] })
	]);
	await unsubscribeUser(env, userId, `thread:${thread.id}`);
	await announce(env, thread.id, everyone(thread), { type: 'thread.members' });
}

export async function removePerson(env: Env, who: SignedIn, thread: LoadedThread, userId: string) {
	assertGroup(thread);
	if (userId === who.user.id) error(400, strings.errors.removeSelf);
	if (!thread.people.some((p) => p.id === userId)) error(404, strings.errors.notInThread);
	await dropMember(env, thread, userId, who.user.id);
}

/** Leaves a group. The favorite goes with the membership (0026's trigger). */
export async function leaveThread(env: Env, who: SignedIn, thread: LoadedThread) {
	assertGroup(thread);
	await dropMember(env, thread, who.user.id, who.user.id);
}

/**
 * Admins and members delete threads they're in, as Campsite's role.rb; viewers and guests
 * don't. A channel goes with its project.
 */
export function canDeleteThread(who: SignedIn, thread: { kind: ThreadKind }): boolean {
	const role = who.member.role;
	return (role === 'admin' || role === 'member') && thread.kind !== 'channel';
}

/** Deletes the thread with its messages, files and inbox rows, for every member at once. */
export async function deleteThread(env: Env, who: SignedIn, thread: LoadedThread) {
	if (!canDeleteThread(who, thread)) error(403, strings.errors.cannotDelete);
	const { attachments, chatThreads, notifications: n } = schema;
	const files = await db(env)
		.select({ id: attachments.id })
		.from(attachments)
		.where(eq(attachments.threadId, thread.id));
	const d = db(env);
	await d.batch([
		d.delete(n).where(eq(n.itemKey, `thread:${thread.id}`)),
		d.delete(chatThreads).where(eq(chatThreads.id, thread.id))
	]);
	for (const file of files) await deleteObject(env, attachmentKey(file.id));
	if (thread.imageKey) await deleteObject(env, thread.imageKey);
	await announce(env, thread.id, everyone(thread), { type: 'thread.deleted' });
}

/** Who added or removed whom in the thread, oldest first, by name. */
export async function membershipUpdates(env: Env, threadId: string) {
	const { chatMembershipUpdates: u } = schema;
	const [rows, named] = await Promise.all([
		db(env)
			.select()
			.from(u)
			.where(eq(u.threadId, threadId))
			.orderBy(u.createdAt, sql`rowid`),
		// Everyone the rows name, read through the rows themselves: D1 caps a list of ids at 100.
		db(env).all<{ id: string; name: string }>(
			sql`SELECT id, name FROM users WHERE id IN (
				SELECT actor_id FROM chat_membership_updates WHERE thread_id = ${threadId}
				UNION SELECT j.value FROM chat_membership_updates, json_each(added) j WHERE thread_id = ${threadId}
				UNION SELECT j.value FROM chat_membership_updates, json_each(removed) j WHERE thread_id = ${threadId})`
		)
	]);
	const names = new Map(named.map((p) => [p.id, p.name]));
	const nameOf = (id: string) => names.get(id)!;
	return rows.map((row) => ({
		id: row.id,
		createdAt: row.createdAt,
		actorName: nameOf(row.actorId),
		left: row.removed.length === 1 && row.removed[0] === row.actorId,
		added: row.added.map(nameOf),
		removed: row.removed.map(nameOf)
	}));
}

export type MembershipUpdate = Awaited<ReturnType<typeof membershipUpdates>>[number];
