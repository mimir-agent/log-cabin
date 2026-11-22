import { getEnv } from '#lib/server/platform.js';
import { publicFile } from '#lib/server/posts/public-links.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => publicFile(getEnv(), params.token, 'logo');
