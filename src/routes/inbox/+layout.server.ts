import { error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { getEnv } from '#lib/server/platform.js';
import { inboxTabs, listInbox, type InboxTab } from '#lib/server/notifications/inbox.js';
import { core } from '#lib/strings/core.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const who = requireMember(event);
	const requested = event.url.searchParams.get('tab') ?? 'unread';
	if (!inboxTabs.includes(requested as InboxTab)) {
		error(404, core.errors.notFound);
	}
	const tab = requested as InboxTab;
	// Opening an item reads it, so the list is read again on each navigation: what was just
	// opened leaves Unread when the next page is chosen.
	void event.url.pathname;
	return { tab, tabs: inboxTabs, items: await listInbox(getEnv(), who, tab) };
};
