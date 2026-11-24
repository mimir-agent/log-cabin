-- The line a push and mail show under a notification's sentence: "<prefix>: <excerpt>", made once
-- when the notification is. Adds only. Null for every notification made before this column, and
-- for kinds with no body to quote.
ALTER TABLE notifications ADD COLUMN preview TEXT;
