// Adapted from Campsite (https://github.com/campsite/campsite), api/app/jobs/user_post_digest_notification_job.rb, api/app/views/mailers/organization/daily_digest.html.erb and api/app/views/mailers/organization/weekly_digest.html.erb, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/
import {
	aliasedTable,
	and,
	count,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lt,
	ne,
	or,
	sql
} from 'drizzle-orm';
import { db, schema } from '../db';
import type { Role } from '../db/schema';
import { sendEmailOnce } from '../email';
import { renderEmail, type EmailBlock } from '../email/layout';
import { getOrg } from '../org';
import { visibleProjectIds } from '../posts/access';
import { notifications as strings } from '../../strings/notifications';
import { localClock } from './quiet';
import { appUrl, unsubscribeHeaders } from './email';
import { defaultSettings, type NotificationSettings } from './settings';

const hour = 60 * 60 * 1000;
const day = 24 * hour;
// A busy org's week can hold more posts than anyone reads in one email.
const maxPosts = 30;

type Person = { userId: string; email: string; role: Role };

/**
 * New posts since `since` in the projects someone belongs to or starred, and on posts they
 * follow, in projects they can see that aren't archived: the latest version of each, newest
 * first, with the comment that got the most reactions (the earliest, on a tie). With
 * `excludeOwnPosts`, the reader's own posts are left out, as the daily digest does.
 */
async function digestPosts(
	env: Env,
	person: Person,
	since: number,
	until: number,
	{ excludeOwnPosts }: { excludeOwnPosts: boolean }
) {
	const {
		comments,
		posts,
		postSubscriptions,
		projectFavorites,
		projectMembers,
		projects,
		reactions,
		users
	} = schema;
	const who = { user: { id: person.userId }, member: { role: person.role } };
	const followed = or(
		inArray(
			posts.projectId,
			db(env)
				.select({ id: projectMembers.projectId })
				.from(projectMembers)
				.where(eq(projectMembers.userId, person.userId))
		),
		inArray(
			posts.projectId,
			db(env)
				.select({ id: projectFavorites.projectId })
				.from(projectFavorites)
				.where(eq(projectFavorites.userId, person.userId))
		),
		inArray(
			posts.id,
			db(env)
				.select({ id: postSubscriptions.postId })
				.from(postSubscriptions)
				.where(eq(postSubscriptions.userId, person.userId))
		)
	);
	const rows = await db(env)
		.select({
			id: posts.id,
			title: posts.title,
			author: users.name,
			project: projects.name
		})
		.from(posts)
		.innerJoin(projects, eq(projects.id, posts.projectId))
		.innerJoin(users, eq(users.id, posts.authorId))
		.where(
			and(
				gte(posts.createdAt, since),
				lt(posts.createdAt, until),
				isNull(projects.archivedAt),
				visibleProjectIds(who),
				followed,
				sql`NOT EXISTS (SELECT 1 FROM ${posts} AS newer WHERE newer.parent_id = ${posts.id})`,
				excludeOwnPosts ? ne(posts.authorId, person.userId) : undefined
			)
		)
		.orderBy(desc(posts.createdAt))
		.limit(maxPosts);
	if (rows.length === 0) return [];

	const commenters = aliasedTable(users, 'commenters');
	const ranked = await db(env)
		.select({
			postId: comments.postId,
			author: commenters.name,
			text: comments.bodyText,
			reactions: count(reactions.id)
		})
		.from(comments)
		.innerJoin(commenters, eq(commenters.id, comments.authorId))
		.leftJoin(
			reactions,
			and(eq(reactions.subjectType, 'comment'), eq(reactions.subjectId, comments.id))
		)
		.where(
			inArray(
				comments.postId,
				rows.map((row) => row.id)
			)
		)
		.groupBy(comments.id)
		.orderBy(desc(count(reactions.id)), comments.createdAt);
	const top = new Map<string, (typeof ranked)[number]>();
	for (const comment of ranked) if (!top.has(comment.postId)) top.set(comment.postId, comment);
	return rows.map((row) => ({ ...row, topComment: top.get(row.id) ?? null }));
}

/** Projects created since `since` that someone can see and that aren't archived. */
async function newProjects(env: Env, person: Person, since: number, until: number) {
	const { projects, users } = schema;
	const who = { user: { id: person.userId }, member: { role: person.role } };
	return db(env)
		.select({ id: projects.id, name: projects.name, creator: users.name })
		.from(projects)
		.innerJoin(users, eq(users.id, projects.createdBy))
		.where(
			and(
				gte(projects.createdAt, since),
				lt(projects.createdAt, until),
				isNull(projects.archivedAt),
				visibleProjectIds(who)
			)
		)
		.orderBy(desc(projects.createdAt));
}

function postItems(env: Env, rows: Awaited<ReturnType<typeof digestPosts>>): EmailBlock {
	const s = strings.digests;
	return {
		items: rows.map((row) => ({
			line: s.post(row.author, row.title || s.untitled, row.project),
			detail: row.topComment && s.topComment(row.topComment.author, excerpt(row.topComment.text)),
			url: `${appUrl(env)}/posts/${row.id}`
		}))
	};
}

function excerpt(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length > 200 ? `${flat.slice(0, 199)}…` : flat;
}

/**
 * Every hour: the daily digest of the last day's posts by others, and the weekly summary of
 * the week's posts and new projects, to each active member whose chosen local hour (and
 * weekday, for the weekly) has come and who hasn't had it yet that day (that week). Nothing
 * new, nothing sent. Campsite sends these at the hour chosen whatever the notification
 * schedule says, and so does this.
 */
export async function sendDigests(env: Env, now: number): Promise<void> {
	const { members, notificationSettings, users } = schema;
	const people = await db(env)
		.select({
			userId: users.id,
			email: users.email,
			timezone: users.timezone,
			role: members.role,
			settings: notificationSettings
		})
		.from(users)
		.innerJoin(members, eq(members.userId, users.id))
		.leftJoin(notificationSettings, eq(notificationSettings.userId, users.id))
		.where(isNull(members.deactivatedAt));
	const orgName = (await getOrg(env)).name;

	// One failed send (Resend limits the rate) mustn't cost everyone after it their digest.
	const failures: string[] = [];
	for (const person of people) {
		const settings = person.settings ?? {
			...defaultSettings,
			lastDailyDigestAt: null,
			lastWeeklyDigestAt: null
		};
		const today = localClock(now, person.timezone);
		const sentOn = (at: number | null) => (at === null ? null : localClock(at, person.timezone));
		const lastDaily = sentOn(settings.lastDailyDigestAt);
		const lastWeekly = sentOn(settings.lastWeeklyDigestAt);
		// Each is due from its local hour until the day ends, once a day (once a week, for the
		// weekly). So a retried run, the hour the clocks go back through twice, or a new hour or
		// zone sends nothing more; and the hour the clocks skip, or a send that failed, is made
		// up at the next run.
		const dailyDue =
			settings.dailyDigest &&
			today.minute >= settings.dailyDigestHour * 60 &&
			lastDaily?.date !== today.date;
		const weeklyDue =
			settings.weeklyDigest &&
			today.weekday === settings.weeklyDigestWeekday &&
			today.minute >= settings.weeklyDigestHour * 60 &&
			(lastWeekly === null || weekOf(lastWeekly) !== weekOf(today));

		try {
			if (dailyDue) {
				await sendDailyDigest(env, person, now, orgName);
				await markSent(env, person.userId, settings, { lastDailyDigestAt: now });
			}
			if (weeklyDue) {
				await sendWeeklyDigest(env, person, now, orgName);
				await markSent(env, person.userId, settings, { lastWeeklyDigestAt: now });
			}
		} catch (cause) {
			failures.push(`user ${person.userId}: ${String(cause)}`);
		}
	}
	if (failures.length) {
		throw new Error(
			`sendDigests: digests failed to send for ${failures.length} of ${people.length} people: ${failures.join('; ')}`
		);
	}
}

async function sendDailyDigest(env: Env, person: Person, now: number, orgName: string) {
	const s = strings.digests;
	const posts = await digestPosts(env, person, now - day, now, { excludeOwnPosts: true });
	if (posts.length) {
		await sendEmailOnce(env, {
			to: person.email,
			headers: unsubscribeHeaders(env),
			...renderEmail(
				{
					subject: s.dailySubject(posts.length),
					blocks: [{ paragraph: s.dailyIntro }, postItems(env, posts), footer(env)]
				},
				orgName
			)
		});
	}
}

async function sendWeeklyDigest(env: Env, person: Person, now: number, orgName: string) {
	const s = strings.digests;
	const posts = await digestPosts(env, person, now - 7 * day, now, { excludeOwnPosts: false });
	const projects = await newProjects(env, person, now - 7 * day, now);
	if (posts.length || projects.length) {
		const blocks: EmailBlock[] = [{ paragraph: s.weeklyIntro }];
		if (posts.length) blocks.push({ heading: s.posts }, postItems(env, posts));
		if (projects.length) {
			blocks.push(
				{ heading: s.projects },
				{
					items: projects.map((project) => ({
						line: s.project(project.name, project.creator),
						detail: null,
						url: `${appUrl(env)}/projects/${project.id}`
					}))
				}
			);
		}
		await sendEmailOnce(env, {
			to: person.email,
			headers: unsubscribeHeaders(env),
			...renderEmail(
				{ subject: s.weeklySubject(orgName), blocks: [...blocks, footer(env)] },
				orgName
			)
		});
	}
}

/** The local week of a date, as the date of its Sunday. */
function weekOf(clock: { date: number; weekday: number }): number {
	return clock.date - clock.weekday;
}

function footer(env: Env): EmailBlock {
	return { note: strings.digests.footer(`${appUrl(env)}/settings/notifications`) };
}

async function markSent(
	env: Env,
	userId: string,
	settings: NotificationSettings,
	sent: { lastDailyDigestAt: number } | { lastWeeklyDigestAt: number }
) {
	const { notificationSettings } = schema;
	await db(env)
		.insert(notificationSettings)
		.values({ ...settings, userId, ...sent })
		.onConflictDoUpdate({ target: notificationSettings.userId, set: sent });
}
