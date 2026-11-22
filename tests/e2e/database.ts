// Changing the running server's database from a spec. serve.ts seeds it once and every spec shares
// it, so a spec that needs the seeded inbox item unread calls `unreadFixture()` first: opening
// Ada's post, which most specs do, reads it.
import { execFileSync } from 'node:child_process';
import { persistTo, post } from './fixtures.ts';

export function d1(sql: string) {
	execFileSync(
		'pnpm',
		[
			'exec',
			'wrangler',
			'd1',
			'execute',
			'campfire',
			'--local',
			'--persist-to',
			persistTo,
			'--command',
			sql
		],
		{ stdio: 'inherit' }
	);
}

/** Puts the inbox item that Bo's comment gave Ada back to unread. */
export function unreadFixture() {
	d1(
		`UPDATE notifications SET read_at = NULL, archived_at = NULL WHERE id = '${post.notification}'`
	);
}
