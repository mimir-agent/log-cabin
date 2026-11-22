import { addNav } from './nav';
import { posts } from './strings/posts';

addNav(
	// The sidebar's projects heading links here.
	{
		href: '/projects',
		label: posts.nav.projects,
		icon: 'project',
		order: 30,
		place: 'hidden'
	},
	{ href: '/drafts', label: posts.drafts.title, icon: 'post-draft', order: 18 },
	{
		href: '/settings/emoji',
		label: posts.emoji.nav,
		icon: 'face-smile',
		minRole: 'viewer',
		order: 92,
		place: 'org'
	}
);
