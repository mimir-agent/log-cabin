import { error, json } from '@sveltejs/kit';
import { clientDocuments } from '#lib/server/atproto/client.js';
import { getEnv } from '#lib/server/platform.js';
import type { RequestHandler } from './$types';

// The public half of the client's signing key, for a PDS checking its client assertions.
export const GET: RequestHandler = async () => {
	const documents = await clientDocuments(getEnv());
	if (!documents) error(404, 'Not found');
	return json(documents.jwks, { headers: { 'cache-control': 'public, max-age=300' } });
};
