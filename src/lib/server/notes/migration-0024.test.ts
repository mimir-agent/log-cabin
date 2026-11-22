import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

// 0024 adds when each note last saw activity, who hears about its comments, its timeline and its files. This applies
// every migration before it to a database with notes and comments, then 0024, and checks the
// backfills and the triggers.
const target = '0024_parity.sql';
const earlier = readdirSync('migrations')
	.filter((f) => f.endsWith('.sql') && f < target)
	.sort();

function migratedWithNotes() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON');
	for (const file of earlier) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
	sqlite.exec(`
		INSERT INTO users (id, email, name, username, created_at)
			VALUES ('u1', 'ada@example.com', 'Ada', 'ada', 0), ('u2', 'bo@example.com', 'Bo', 'bo', 0);
		INSERT INTO notes (id, author_id, title, body, body_text, created_at, updated_at, updated_by)
			VALUES ('quiet', 'u1', 'Quiet', '{}', '', 1, 10, 'u1'), ('talked', 'u1', 'Talked', '{}', '', 1, 10, 'u1');
		INSERT INTO note_comments (id, note_id, author_id, body, body_text, created_at)
			VALUES ('c1', 'talked', 'u1', '{}', '', 30), ('c2', 'talked', 'u1', '{}', '', 20),
				('b1', 'talked', 'u2', '{}', '', 21), ('b2', 'talked', 'u2', '{}', '', 22);
	`);
	sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));
	return sqlite;
}

function activity(sqlite: DatabaseSync, id: string) {
	const row = sqlite.prepare('SELECT last_activity_at FROM notes WHERE id = ?').get(id) as {
		last_activity_at: number;
	};
	return row.last_activity_at;
}

describe('migration 0024', () => {
	it('dates each existing note by its last edit or its latest comment', () => {
		const sqlite = migratedWithNotes();
		expect(activity(sqlite, 'quiet'), 'no comments: its last edit').toBe(10);
		expect(activity(sqlite, 'talked'), 'its latest comment').toBe(30);
	});

	it('moves a note’s activity with a new comment and a later edit, never back', () => {
		const sqlite = migratedWithNotes();
		sqlite.exec(`INSERT INTO note_comments (id, note_id, author_id, body, body_text, created_at)
			VALUES ('c3', 'quiet', 'u1', '{}', '', 40)`);
		expect(activity(sqlite, 'quiet'), 'the new comment').toBe(40);
		sqlite.exec(`INSERT INTO note_comments (id, note_id, author_id, body, body_text, created_at)
			VALUES ('c4', 'talked', 'u1', '{}', '', 25)`);
		expect(activity(sqlite, 'talked'), 'an older comment leaves it').toBe(30);
		sqlite.exec(`UPDATE notes SET updated_at = 50 WHERE id = 'talked'`);
		expect(activity(sqlite, 'talked'), 'the edit').toBe(50);
		sqlite.exec(`INSERT INTO notes (id, author_id, title, body, body_text, created_at, updated_at, updated_by)
			VALUES ('new', 'u1', 'New', '{}', '', 60, 60, 'u1')`);
		expect(activity(sqlite, 'new'), 'a new note starts at its creation').toBe(60);
	});

	it('lays out everyone’s notes index as a list until they choose', () => {
		const sqlite = migratedWithNotes();
		const row = sqlite.prepare("SELECT note_layout FROM users WHERE id = 'u1'").get();
		expect(row).toEqual({ note_layout: 'list' });
		expect(() => sqlite.exec("UPDATE users SET note_layout = 'table'")).toThrow(/CHECK/);
	});

	it('subscribes each note’s author and everyone who commented on it, once each', () => {
		const sqlite = migratedWithNotes();
		const rows = sqlite
			.prepare('SELECT note_id, user_id FROM note_subscriptions ORDER BY note_id, user_id')
			.all();
		expect(rows, 'Ada wrote both notes; Bo commented twice on one').toEqual([
			{ note_id: 'quiet', user_id: 'u1' },
			{ note_id: 'talked', user_id: 'u1' },
			{ note_id: 'talked', user_id: 'u2' }
		]);
	});

	it('leaves every existing comment unresolved', () => {
		const sqlite = migratedWithNotes();
		const rows = sqlite
			.prepare('SELECT DISTINCT resolved_at, resolved_by FROM note_comments')
			.all();
		expect(rows).toEqual([{ resolved_at: null, resolved_by: null }]);
	});

	it('starts every note with no views, and forgets a note’s views with the note', () => {
		const sqlite = migratedWithNotes();
		const counts = sqlite.prepare('SELECT DISTINCT anonymous_views FROM notes').all();
		expect(counts, 'no anonymous views yet').toEqual([{ anonymous_views: 0 }]);
		sqlite.exec("INSERT INTO note_views VALUES ('quiet', 'u1', 5), ('quiet', 'u2', 6)");
		expect(() => sqlite.exec("INSERT INTO note_views VALUES ('quiet', 'u1', 7)")).toThrow(/UNIQUE/);
		sqlite.exec("DELETE FROM notes WHERE id = 'quiet'");
		expect(sqlite.prepare('SELECT * FROM note_views').all(), 'views go with the note').toEqual([]);
	});

	it('forgets a reference to a note when the post or note that made it is deleted', () => {
		const sqlite = migratedWithNotes();
		sqlite.exec(`
			INSERT INTO projects (id, name, created_by, created_at) VALUES ('p1', 'General', 'u1', 0);
			INSERT INTO posts (id, project_id, author_id, title, body, body_text, created_at, last_activity_at)
				VALUES ('post1', 'p1', 'u1', 'Plan', '{}', '', 1, 1);
			INSERT INTO note_events (id, note_id, actor_id, kind, ref_type, ref_id, title, created_at) VALUES
				('e1', 'quiet', 'u1', 'referenced', 'post', 'post1', NULL, 2),
				('e2', 'quiet', 'u1', 'referenced', 'note', 'talked', NULL, 3),
				('e3', 'quiet', 'u1', 'title', NULL, NULL, 'post1', 4);
		`);
		const left = () =>
			sqlite
				.prepare('SELECT id FROM note_events ORDER BY id')
				.all()
				.map((r) => r.id);
		expect(() =>
			sqlite.exec(`INSERT INTO note_events (id, note_id, actor_id, kind, ref_type, ref_id, created_at)
				VALUES ('e4', 'quiet', 'u2', 'referenced', 'post', 'post1', 5)`)
		).toThrow(/UNIQUE/);
		sqlite.exec("DELETE FROM posts WHERE id = 'post1'");
		expect(left(), 'the post’s reference goes; the rename stays').toEqual(['e2', 'e3']);
		sqlite.exec("DELETE FROM notes WHERE id = 'talked'");
		expect(left(), 'the note’s reference goes too').toEqual(['e3']);
	});

	it('pins a note comment only to a point in range on one of its files, and forgets the file with the note', () => {
		const sqlite = migratedWithNotes();
		sqlite.exec(`INSERT INTO note_attachments (id, note_id, uploaded_by, name, content_type, size, created_at)
			VALUES ('a1', 'talked', 'u1', 'shot.png', 'image/png', 4, 1)`);
		const comment = (id: string, point: string) =>
			sqlite.exec(`INSERT INTO note_comments (id, note_id, author_id, body, body_text, created_at, attachment_id, x, y)
				VALUES ('${id}', 'talked', 'u1', '{}', '', 50, ${point})`);
		comment('p1', "'a1', 0.25, 0.75");
		expect(() => comment('p2', 'NULL, 0.5, 0.5'), 'a point needs a file').toThrow(/CHECK/);
		expect(() => comment('p3', "'a1', NULL, 0.5"), 'y needs x').toThrow(/CHECK/);
		expect(() => comment('p4', "'a1', 1.5, 0.5"), 'x past the edge').toThrow(/CHECK/);
		sqlite.exec("DELETE FROM notes WHERE id = 'talked'");
		expect(
			sqlite.prepare('SELECT * FROM note_attachments').all(),
			'files go with the note'
		).toEqual([]);
	});
});
