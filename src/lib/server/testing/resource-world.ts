// A small org whose notes, posts and calls each person sees differently, for the tests of
// resource mentions: the search behind the @ list, the titles a page shows, and the endpoints.
import { signedIn, notificationWorld } from '../notifications/testing/world';
import type { Role } from '../db/schema';

/**
 * ada (member) writes everything; bo is a member, cy a guest, dee an admin. "Open" is a public
 * project, "Vault" a private one only ada is in. Each note, post and call is named for who may
 * see it besides ada.
 */
export function resourceWorld() {
	const w = notificationWorld();
	const roles: Record<string, Role> = { ada: 'member', bo: 'member', cy: 'guest', dee: 'admin' };
	for (const [id, role] of Object.entries(roles)) w.person(id, role);
	w.project('Open', 'ada');
	w.project('Vault', 'ada', { private: true, members: ['ada'] });
	const post = (id: string, projectId: string, title: string) =>
		w.sqlite
			.prepare(
				"INSERT INTO posts (id, project_id, author_id, title, body, body_text, created_at, last_activity_at) VALUES (?, ?, 'ada', ?, '{}', '', 0, 0)"
			)
			.run(id, projectId, title);
	const note = (id: string, title: string, sharedWith: string[] = []) => {
		w.note(id, 'ada', sharedWith);
		w.sqlite.prepare('UPDATE notes SET title = ? WHERE id = ?').run(title, id);
	};
	const call = (id: string, projectId: string, title: string | null) =>
		w.sqlite
			.prepare(
				"INSERT INTO calls (id, project_id, started_by, started_at, ended_at, title) VALUES (?, ?, 'ada', 0, 1, ?)"
			)
			.run(id, projectId, title);
	post('post-open', 'Open', 'Harbour budget');
	post('post-vault', 'Vault', 'Harbour secret');
	note('note-bo', 'Harbour packing list', ['bo']);
	note('note-private', 'Harbour diary');
	call('call-open', 'Open', 'Harbour standup');
	call('call-vault', 'Vault', 'Harbour board');
	call('call-untitled', 'Open', null);
	const as = (id: string) => {
		const who = signedIn(id);
		who.member.role = roles[id];
		return who;
	};
	return { ...w, post, note, call, as };
}
