import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { requireMember } from '#lib/server/auth/guard.js';
import { db, schema } from '#lib/server/db/index.js';
import { notificationKinds } from '#lib/server/db/schema/notifications.js';
import { getSettings, saveSettings } from '#lib/server/notifications/settings.js';
import { quietRules, saveSchedule, type Schedule } from '#lib/server/notifications/quiet.js';
import { getEnv } from '#lib/server/platform.js';
import { timeZones, timezoneOf } from '#lib/server/people/time-zone.js';
import { notifications } from '#lib/strings/notifications.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { user } = requireMember(event);
	const env = getEnv();
	const quiet = (await quietRules(env, [user.id])).get(user.id)!;
	return {
		settings: await getSettings(env, user.id),
		timezone: await timezoneOf(env, user.id),
		schedule: quiet.schedule,
		pausedUntil:
			quiet.pausedUntil !== null && quiet.pausedUntil > Date.now() ? quiet.pausedUntil : null,
		kinds: notificationKinds,
		timeZones,
		vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null
	};
};

/** The schedule a settings form asks for: null for notifications at all times. */
function parseSchedule(form: FormData): Schedule | null | { message: string } {
	const errors = notifications.settings.errors;
	if (form.get('schedule') !== 'custom') return null;
	const weekdays = form.getAll('weekday').map(Number);
	if (weekdays.length === 0) return { message: errors.scheduleDaysMissing };
	if (weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
		return { message: errors.weekdayInvalid };
	}
	const startMinute = Number(form.get('startMinute'));
	const endMinute = Number(form.get('endMinute'));
	const minuteOk = (m: number) => Number.isInteger(m) && m >= 0 && m <= 1440;
	if (!minuteOk(startMinute) || !minuteOk(endMinute) || startMinute >= endMinute) {
		return { message: errors.scheduleTimesInvalid };
	}
	return { weekdays: [...new Set(weekdays)].sort((a, b) => a - b), startMinute, endMinute };
}

export const actions: Actions = {
	default: async (event) => {
		const { user } = requireMember(event);
		const env = getEnv();
		const form = await event.request.formData();
		const errors = notifications.settings.errors;

		const hourOf = (name: string) => {
			const value = Number(form.get(name));
			return Number.isInteger(value) && value >= 0 && value <= 23 ? value : null;
		};
		const dailyDigestHour = hourOf('dailyDigestHour');
		const weeklyDigestHour = hourOf('weeklyDigestHour');
		const weeklyDigestWeekday = Number(form.get('weeklyDigestWeekday'));
		if (dailyDigestHour === null || weeklyDigestHour === null) {
			return fail(400, { message: errors.hourInvalid });
		}
		if (
			!Number.isInteger(weeklyDigestWeekday) ||
			weeklyDigestWeekday < 0 ||
			weeklyDigestWeekday > 6
		) {
			return fail(400, { message: errors.weekdayInvalid });
		}
		const timezone = String(form.get('timezone'));
		if (!timeZones.includes(timezone)) return fail(400, { message: errors.timezoneInvalid });
		const schedule = parseSchedule(form);
		if (schedule && 'message' in schedule) return fail(400, { scheduleError: schedule.message });

		await saveSettings(env, user.id, {
			emailKinds: notificationKinds.filter((kind) => form.has(`email-${kind}`)),
			pushKinds: notificationKinds.filter((kind) => form.has(`push-${kind}`)),
			dailyDigest: form.has('dailyDigest'),
			dailyDigestHour,
			weeklyDigest: form.has('weeklyDigest'),
			weeklyDigestWeekday,
			weeklyDigestHour
		});
		await saveSchedule(env, user.id, schedule);
		await db(env).update(schema.users).set({ timezone }).where(eq(schema.users.id, user.id));
		return { saved: true };
	}
};
