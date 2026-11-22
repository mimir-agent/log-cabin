import { error, json } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { pauseNotifications } from '#lib/server/notifications/quiet.js';
import { getEnv } from '#lib/server/platform.js';
import { notifications } from '#lib/strings/notifications.js';
import type { RequestHandler } from './$types';

/** Pauses the signed-in person's push and email until `until` (ms since the epoch). */
export const POST: RequestHandler = async (event) => {
	const { user } = requireMember(event);
	const body = (await event.request.json().catch(() => null)) as { until?: unknown } | null;
	const until = body?.until;
	if (typeof until !== 'number' || !Number.isFinite(until) || until <= Date.now()) {
		error(400, notifications.settings.errors.pauseInvalid);
	}
	await pauseNotifications(getEnv(), user.id, until);
	return json({ pausedUntil: until });
};

/** Resumes them now. */
export const DELETE: RequestHandler = async (event) => {
	const { user } = requireMember(event);
	await pauseNotifications(getEnv(), user.id, null);
	return json({ pausedUntil: null });
};
