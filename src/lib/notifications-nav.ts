import { addNav } from './nav';
import { notifications } from './strings/notifications';

addNav(
	{ href: '/inbox', label: notifications.nav.inbox, icon: 'inbox', order: 10, tab: true },
	{
		href: '/activity',
		label: notifications.nav.activity,
		icon: 'bolt',
		order: 20,
		place: 'header'
	},
	{
		href: '/settings/notifications',
		label: notifications.nav.settings,
		icon: 'bell',
		order: 96,
		place: 'account'
	}
);
