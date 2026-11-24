import { getEnv } from '#lib/server/platform.js';
import { legalOperator } from '#lib/server/org.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ operator: await legalOperator(getEnv()) });
