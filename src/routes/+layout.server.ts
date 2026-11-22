import { getEnv } from '#lib/server/platform.js';
import { unreadCount } from '#lib/server/notifications/notify.js';
import { inboxAbout, itemPath } from '#lib/server/notifications/inbox.js';
import { getOrg } from '#lib/server/org.js';
import { getObjectUrl } from '#lib/server/storage.js';
import { sidebarProjects } from '#lib/server/posts/projects.js';
import { dropUnseenNoteFavorites, sidebarFavorites } from '#lib/server/favorites.js';
import { ringingFor } from '#lib/server/calls/invitations.js';
import { callsEnabled } from '#lib/server/calls/sfu.js';
import { zoneCookie, zoneOf } from '#lib/time-zone.js';
import { timezoneOf } from '#lib/server/people/time-zone.js';
import { canAddEmoji, customEmojiUrls } from '#lib/server/posts/custom-emoji.js';
import type { OrgEmoji } from '#lib/emoji/picker.js';
import { findablePeople, recentItems } from '#lib/server/search/search.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url, depends, cookies }) => {
	const timeZone = zoneOf(cookies.get(zoneCookie));
	const { user, member } = locals;
	if (!user || !member) {
		return {
			user: null,
			member: null,
			orgName: null,
			orgLogoUrl: null,
			sidebarProjects: null,
			favorites: null,
			unread: 0,
			ringing: [],
			timeZone,
			memberZone: null,
			// Signed out there is no org emoji to show: those pages have no reactions or picker.
			orgEmoji: null,
			people: [],
			recent: [],
			about: null,
			vapidPublicKey: null
		};
	}
	// Reading the path reruns this load on every navigation, which keeps the unread count fresh.
	void url.pathname;
	depends('calls:ringing');
	// Favorite threads show their unread state, which a thread list change can change.
	depends('chat:threads');
	const env = getEnv();
	const who = { user, member };
	// Independent reads, so they run at once: one D1 round trip for all of them, plus one more
	// per ringing call (ringingFor looks up each call's place in turn).
	const [
		org,
		projects,
		{ hiddenNotes, ...favorites },
		unread,
		ringing,
		customEmoji,
		people,
		recent,
		memberZone,
		about
	] = await Promise.all([
		getOrg(env),
		sidebarProjects(env, who),
		sidebarFavorites(env, who),
		unreadCount(env, user.id),
		callsEnabled(env) ? ringingFor(env, who) : [],
		customEmojiUrls(env),
		// The quick switcher matches these as you type, before the server's search answers.
		findablePeople(env, who),
		recentItems(env, who, 6),
		// Others see this member's local time in it; the page updates it from the browser.
		timezoneOf(env, user.id),
		// What the inbox holds about this page, so the page can read it and offer Mark done.
		inboxAbout(env, user.id, itemPath(url.pathname))
	]);
	// A write, so only when the sidebar found a favorite note this member can no longer see.
	if (hiddenNotes) await dropUnseenNoteFavorites(env, who);
	return {
		user,
		member,
		orgName: org.name,
		orgLogoUrl: org.logoKey ? getObjectUrl(org.logoKey) : null,
		sidebarProjects: projects,
		favorites,
		unread,
		ringing,
		timeZone,
		memberZone,
		orgEmoji: {
			custom: customEmoji,
			orgName: org.name,
			canAdd: canAddEmoji(who, org)
		} satisfies OrgEmoji,
		people,
		recent,
		about,
		vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null
	};
};
