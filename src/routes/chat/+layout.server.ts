import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { listThreads } from '#lib/server/chat/threads.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const who = requireMember(event);
	event.depends('chat:threads');
	return { threads: await listThreads(getEnv(), who) };
};
