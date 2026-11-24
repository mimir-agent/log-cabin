import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { sendEmailOnce } from '../email';
import { renderEmail } from '../email/layout';
import { getOrg } from '../org';
import { notifications as strings } from '../../strings/notifications';
import { getSettings } from './settings';
import { quietNow } from './quiet';

/** How long a notification stays unread before it is emailed. */
export const emailAfterMs = 10 * 60 * 1000;

export function appUrl(env: Env): string {
	if (!env.APP_URL) {
		throw new Error(
			'notification email: APP_URL is not set; expected the deployment’s base URL, e.g. https://campfire.example.workers.dev'
		);
	}
	return env.APP_URL.replace(/\/$/, '');
}

/** Notification mail points its List-Unsubscribe at the settings page: there is no one-click endpoint. */
export function unsubscribeHeaders(env: Env): Record<string, string> {
	return { 'List-Unsubscribe': `<${appUrl(env)}/settings/notifications>` };
}

// The actor's name, as a subquery, so a query can also join users for the recipient.
const actorName = sql<string>`(SELECT name FROM users actor WHERE actor.id = ${schema.notifications.actorId})`;

type Row = {
	actorName: string;
	kind: (typeof schema.notifications.$inferSelect)['kind'];
	itemKey: string;
	url: string;
	title: string | null;
	preview: string | null;
};

/** A list of notifications as an email: what happened, a button to the inbox, and how to stop. */
async function notificationsEmail(env: Env, subject: string, intro: string, rows: Row[]) {
	const base = appUrl(env);
	return renderEmail(
		{
			subject,
			blocks: [
				{ paragraph: intro },
				{
					items: rows.map((row) => ({
						line: strings.line(row.actorName, row.kind, row.itemKey),
						detail: row.preview ?? row.title,
						url: `${base}${row.url}`
					}))
				},
				{ button: { label: strings.email.open, url: `${base}/inbox` } },
				{ note: strings.email.footer(`${base}/settings/notifications`) }
			]
		},
		(await getOrg(env)).name
	);
}

/**
 * Every 5 minutes: emails each person the notifications still unread after emailAfterMs, of the
 * kinds they get by email, in one message. Each notification is considered once.
 */
export async function emailUnread(env: Env, now: number): Promise<void> {
	const { notifications, users } = schema;
	const due = await db(env)
		.select({
			id: notifications.id,
			userId: notifications.userId,
			kind: notifications.kind,
			itemKey: notifications.itemKey,
			url: notifications.url,
			title: notifications.title,
			preview: notifications.preview,
			email: users.email,
			actorName
		})
		.from(notifications)
		.innerJoin(users, eq(users.id, notifications.userId))
		.where(
			and(
				isNull(notifications.readAt),
				isNull(notifications.archivedAt),
				// Set when it was emailed, and also when it arrived in quiet hours (notify.ts), so
				// that it is never emailed later.
				isNull(notifications.emailedAt),
				lte(notifications.createdAt, now - emailAfterMs)
			)
		)
		.orderBy(desc(notifications.createdAt));

	const byUser = Map.groupBy(due, (row) => row.userId);
	for (const [userId, rows] of byUser) {
		const settings = await getSettings(env, userId);
		// In their quiet hours nothing is sent, and what's due now isn't sent later either.
		const quiet = await quietNow(env, userId, now);
		const wanted = quiet ? [] : rows.filter((row) => settings.emailKinds.includes(row.kind));
		if (wanted.length) {
			await sendEmailOnce(env, {
				to: rows[0].email,
				headers: unsubscribeHeaders(env),
				...(await notificationsEmail(
					env,
					strings.email.unreadSubject(wanted.length),
					strings.email.unreadIntro,
					wanted
				))
			});
		}
		await db(env)
			.update(notifications)
			.set({ emailedAt: now })
			.where(
				inArray(
					notifications.id,
					rows.map((row) => row.id)
				)
			);
	}
}
