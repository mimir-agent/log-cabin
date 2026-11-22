import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';

/** The hours someone gets push and email, on these weekdays (0 = Sunday), in their zone. */
export type Schedule = { weekdays: number[]; startMinute: number; endMinute: number };

/** What decides whether someone is quiet: their schedule, a pause, and their time zone. */
export type QuietRule = { schedule: Schedule | null; pausedUntil: number | null; timeZone: string };

const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayMs = 24 * 60 * 60 * 1000;

/**
 * The weekday (0 = Sunday), the minute of the day and the date (as days since 1 January 1970)
 * at `at` in an IANA time zone.
 */
export function localClock(
	at: number,
	timeZone: string
): { weekday: number; minute: number; date: number } {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		weekday: 'short',
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric',
		hourCycle: 'h23'
	}).formatToParts(new Date(at));
	const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
	return {
		weekday: weekdayNames.indexOf(part('weekday')),
		minute: Number(part('hour')) * 60 + Number(part('minute')),
		date: Date.UTC(Number(part('year')), Number(part('month')) - 1, Number(part('day'))) / dayMs
	};
}

/**
 * Whether push and email are held for someone at `at`: they paused notifications until later,
 * or it's outside their schedule's hours, or on a day it leaves out (Campsite pauses from a
 * schedule's end until its next start).
 */
export function isQuiet(rule: QuietRule, at: number): boolean {
	if (rule.pausedUntil !== null && at < rule.pausedUntil) return true;
	if (!rule.schedule) return false;
	const { weekday, minute } = localClock(at, rule.timeZone);
	const { weekdays, startMinute, endMinute } = rule.schedule;
	return !weekdays.includes(weekday) || minute < startMinute || minute >= endMinute;
}

/** The quiet rules of these people, by user id. */
export async function quietRules(env: Env, userIds: string[]): Promise<Map<string, QuietRule>> {
	if (userIds.length === 0) return new Map();
	const { notificationSchedules: schedules, users } = schema;
	const rows = await db(env)
		.select({
			userId: users.id,
			timeZone: users.timezone,
			pausedUntil: users.notificationsPausedUntil,
			// Null when they have no schedule: the left join found no row.
			schedule: {
				weekdays: schedules.weekdays,
				startMinute: schedules.startMinute,
				endMinute: schedules.endMinute
			}
		})
		.from(users)
		.leftJoin(schedules, eq(schedules.userId, users.id))
		.where(inArray(users.id, userIds));
	return new Map(rows.map(({ userId, ...rule }) => [userId, rule]));
}

export async function quietNow(env: Env, userId: string, now = Date.now()): Promise<boolean> {
	const rule = (await quietRules(env, [userId])).get(userId);
	if (!rule) throw new Error(`quiet hours: user ${userId} not found`);
	return isQuiet(rule, now);
}

/** Saves someone's schedule, or, with null, gets them notifications at all times again. */
export async function saveSchedule(env: Env, userId: string, schedule: Schedule | null) {
	const { notificationSchedules: schedules } = schema;
	if (!schedule) {
		await db(env).delete(schedules).where(eq(schedules.userId, userId));
		return;
	}
	await db(env)
		.insert(schedules)
		.values({ userId, ...schedule })
		.onConflictDoUpdate({ target: schedules.userId, set: schedule });
}

/** Pauses push and email until a time, or, with null, resumes them now. */
export async function pauseNotifications(env: Env, userId: string, until: number | null) {
	const { users } = schema;
	await db(env).update(users).set({ notificationsPausedUntil: until }).where(eq(users.id, userId));
}
