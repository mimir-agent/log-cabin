import { getEnv } from '#lib/server/platform.js';
import { publicNoteFile } from '#lib/server/notes/public.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) =>
	publicNoteFile(getEnv(), params.token, params.id);
