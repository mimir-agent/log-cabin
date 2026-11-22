import type { IconName } from './components/ui/icons/campsite-icons';
import type { Role } from './server/db/schema';
import { auth } from './strings/auth';
import { core } from './strings/core';

/**
 * Where a link sits in the shell:
 * - main: the sidebar's list, with its icon (and in the mobile tab bar when `tab` is set)
 * - header: an icon button in the sidebar's header (search, activity)
 * - org: the menu under the organization's name at the top of the sidebar (people, settings)
 * - account: the menu under the person's avatar at the foot of the sidebar
 * - hidden: reachable from elsewhere (a group heading, a page), not listed
 */
export type NavPlace = 'main' | 'header' | 'org' | 'account' | 'hidden';

export type NavItem = {
	href: string;
	label: string;
	icon?: IconName;
	minRole?: Role;
	order: number;
	place?: NavPlace;
	/** Also a tab in the mobile tab bar. */
	tab?: boolean;
	/** Where the tab goes, when that's not `href`: Home's tab opens the phone's home screen. */
	tabHref?: string;
};

/** The sidebar's links. Each module adds its own with addNav, from its own file. */
export const nav: NavItem[] = [];

export function addNav(...items: NavItem[]): void {
	nav.push(...items);
	nav.sort((a, b) => a.order - b.order);
}

addNav({
	href: '/',
	label: core.nav.home,
	icon: 'home',
	order: 0,
	tab: true,
	tabHref: '/home'
});
addNav(
	{
		href: '/members',
		label: auth.nav.members,
		icon: 'users',
		minRole: 'viewer',
		order: 80,
		place: 'org'
	},
	{
		href: '/settings/invites',
		label: auth.nav.invites,
		icon: 'user-circle-plus',
		minRole: 'admin',
		order: 85,
		place: 'org'
	},
	{
		href: '/settings/org',
		label: auth.nav.orgSettings,
		icon: 'gear',
		minRole: 'admin',
		order: 90,
		place: 'org'
	},
	{
		href: '/settings/profile',
		label: auth.nav.profile,
		icon: 'user-circle',
		order: 95,
		place: 'account'
	},
	{
		href: '/settings/security',
		label: auth.nav.security,
		icon: 'lock',
		order: 95.5,
		place: 'account'
	}
);
