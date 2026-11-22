import { resolve } from '$app/paths';
import { auth } from './strings/auth';
import { calcom } from './strings/calcom';
import { notifications } from './strings/notifications';
import { posts } from './strings/posts';

type Tab = { href: string; label: string; current: boolean };

/** The tabs across the top of a person's own settings, with the one at `path` current. */
export function accountTabs(path: string, withCalcom: boolean): Tab[] {
	const tabs = [
		{ href: resolve('/settings/profile'), label: auth.nav.profile },
		{ href: resolve('/settings/security'), label: auth.nav.security },
		{ href: resolve('/settings/notifications'), label: notifications.nav.settings },
		...(withCalcom ? [{ href: resolve('/settings/calcom'), label: calcom.settings.title }] : [])
	];
	return tabs.map((tab) => ({ ...tab, current: path === tab.href }));
}

/** The tabs across the top of the organization's settings, for admins. */
export function orgTabs(path: string): Tab[] {
	const tabs = [
		{ href: resolve('/settings/org'), label: auth.nav.orgSettings },
		{ href: resolve('/settings/invites'), label: auth.nav.invites },
		{ href: resolve('/settings/emoji'), label: posts.emoji.nav }
	];
	return tabs.map((tab) => ({ ...tab, current: path === tab.href }));
}
