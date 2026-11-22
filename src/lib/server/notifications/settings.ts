import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { notificationKinds, type NotificationKind } from '../db/schema/notifications';

export type NotificationSettings = {
	emailKinds: NotificationKind[];
	pushKinds: NotificationKind[];
	dailyDigest: boolean;
	dailyDigestHour: number;
	weeklyDigest: boolean;
	/** 0 = Sunday. */
	weeklyDigestWeekday: number;
	weeklyDigestHour: number;
};

/**
 * What a person gets before they change anything. The digests are Campsite's
 * `User#create_default_schedule`: daily at 9:00 am, and weekly on Friday at 5:00 pm.
 */
export const defaultSettings: NotificationSettings = {
	emailKinds: ['mention', 'message'],
	pushKinds: [...notificationKinds],
	dailyDigest: true,
	dailyDigestHour: 9,
	weeklyDigest: true,
	weeklyDigestWeekday: 5,
	weeklyDigestHour: 17
};

export async function getSettings(env: Env, userId: string): Promise<NotificationSettings> {
	const row = await db(env)
		.select()
		.from(schema.notificationSettings)
		.where(eq(schema.notificationSettings.userId, userId))
		.get();
	return row ?? defaultSettings;
}

export async function saveSettings(
	env: Env,
	userId: string,
	settings: NotificationSettings
): Promise<void> {
	await db(env)
		.insert(schema.notificationSettings)
		.values({ userId, ...settings })
		.onConflictDoUpdate({ target: schema.notificationSettings.userId, set: settings });
}
