import { json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { receiveWebhook } from '#lib/server/calcom/calcom.js';
import type { RequestHandler } from './$types';

// One member's Cal.com webhook. No session: the signature over the body, made with that
// member's secret, is the check.
export const POST: RequestHandler = async ({ request, url, params }) => {
	const answer = await receiveWebhook(getEnv(), {
		webhookId: params.id,
		origin: url.origin,
		body: await request.text(),
		signature: request.headers.get('x-cal-signature-256')
	});
	return json(answer.body, { status: answer.status });
};
