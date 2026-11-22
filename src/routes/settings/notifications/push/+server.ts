import { error, json } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { getEnv } from '#lib/server/platform.js';
import {
	deleteSubscription,
	parseSubscription,
	saveSubscription
} from '#lib/server/notifications/subscriptions.js';
import { notifications } from '#lib/strings/notifications.js';
import type { RequestHandler } from './$types';

async function subscription(request: Request) {
	const target = parseSubscription(await request.json().catch(() => null));
	if (!target) error(400, notifications.errors.subscriptionInvalid);
	return target;
}

export const POST: RequestHandler = async (event) => {
	const { user } = requireMember(event);
	await saveSubscription(getEnv(), user.id, await subscription(event.request));
	return json({ subscribed: true });
};

export const DELETE: RequestHandler = async (event) => {
	const { user } = requireMember(event);
	const { endpoint } = await subscription(event.request);
	await deleteSubscription(getEnv(), user.id, endpoint);
	return json({ subscribed: false });
};
