-- Tags become rows of their own. Adds only: post_tags keeps its tag column, and gains tag_id.

CREATE TABLE tags (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL UNIQUE,
	created_at INTEGER NOT NULL
);

-- A renamed tag's earlier names, so addresses and #words written before the rename still find it.
CREATE TABLE tag_aliases (
	name TEXT PRIMARY KEY,
	tag_id TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE
);

ALTER TABLE post_tags ADD COLUMN tag_id TEXT REFERENCES tags (id) ON DELETE CASCADE;
CREATE INDEX post_tags_tag_id ON post_tags (tag_id);

-- One row for each tag already in use, and every post's tag pointed at it.
INSERT INTO tags (id, name, created_at)
SELECT upper(hex(randomblob(13))), tag, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM (SELECT DISTINCT tag FROM post_tags);
UPDATE post_tags SET tag_id = (SELECT id FROM tags WHERE tags.name = post_tags.tag);
