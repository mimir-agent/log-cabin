import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import {
	callHistory,
	historyFilters,
	liveCalls,
	type HistoryFilter
} from '#lib/server/calls/history.js';
import { roomPath } from '#lib/server/calls/rooms.js';
import { callsEnabled } from '#lib/server/calls/sfu.js';
import { calcomOn } from '#lib/server/calcom/calcom.js';
import { hasRole } from '#lib/roles.js';
import type { PageServerLoad } from './$types';

// The calls going on now, then every past call this person can see, or only the ones they were in.
export const load: PageServerLoad = async (event) => {
	const who = requireMember(event);
	const env = getEnv();
	const asked = event.url.searchParams.get('filter');
	const filter: HistoryFilter = historyFilters.find((f) => f === asked) ?? 'all';
	if (!callsEnabled(env)) return { enabled: false as const, filter };
	const [live, history] = await Promise.all([
		liveCalls(env, who),
		callHistory(env, who, { filter, cursor: event.url.searchParams.get('cursor') })
	]);
	return {
		enabled: true as const,
		filter,
		filters: historyFilters,
		roomPath: roomPath(who.user),
		live,
		calcom: hasRole(who.member.role, 'member') && (await calcomOn(env)),
		calls: history.calls,
		more: history.next && `?filter=${filter}&cursor=${encodeURIComponent(history.next)}`
	};
};
