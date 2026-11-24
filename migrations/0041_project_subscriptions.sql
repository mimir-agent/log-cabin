-- Who hears about new posts in a project. Adds only. Members are subscribed when they join
-- (the trigger) and unsubscribed when they leave; anyone already a member is subscribed now;
-- favourites follow a project without subscribing to it.
CREATE TABLE project_subscriptions (
	project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_subscriptions_user ON project_subscriptions (user_id);
INSERT INTO project_subscriptions (project_id, user_id, created_at)
	SELECT project_id, user_id, created_at FROM project_members;

CREATE TRIGGER project_members_subscribe AFTER INSERT ON project_members BEGIN
	INSERT OR IGNORE INTO project_subscriptions (project_id, user_id, created_at)
		VALUES (NEW.project_id, NEW.user_id, NEW.created_at);
END;

CREATE TRIGGER project_members_unsubscribe AFTER DELETE ON project_members BEGIN
	DELETE FROM project_subscriptions WHERE project_id = OLD.project_id AND user_id = OLD.user_id;
END;
