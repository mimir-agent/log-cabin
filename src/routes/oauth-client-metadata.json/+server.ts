import { error, json } from '@sveltejs/kit';
import { clientDocuments } from '#lib/server/atproto/client.js';
import { getEnv } from '#lib/server/platform.js';
import type { RequestHandler } from './$types';

// The document a PDS fetches at this deployment's client_id.
export const GET: RequestHandler = async () => {
	const documents = await clientDocuments(getEnv());
	if (!documents) error(404, 'Not found');
	return json(documents.metadata, { headers: { 'cache-control': 'public, max-age=300' } });
};
