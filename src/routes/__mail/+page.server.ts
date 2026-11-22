import { getEnv } from '#lib/server/platform.js';
import { error } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import type { PageServerLoad } from './$types';

// Dev mailbox for EMAIL_TRANSPORT=log. Off unless MAIL_VIEWER_TOKEN is set; a missing or
// wrong token answers 404 so the page's existence isn't revealed.
export const load: PageServerLoad = async ({ url }) => {
	const env = getEnv();
	if (!env.MAIL_VIEWER_TOKEN || url.searchParams.get('token') !== env.MAIL_VIEWER_TOKEN) {
		error(404);
	}
	const messages = await db(env)
		.select()
		.from(schema.devMail)
		.orderBy(desc(schema.devMail.createdAt), desc(schema.devMail.id))
		.limit(50);
	return { messages };
};
