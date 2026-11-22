-- The sentence an inbox row, push and mail read, worded once when the notification is made, and
-- a reaction's emoji for the row's badge. Adds only. Null for every notification made before
-- this column, and for kinds with no sentence of their own (messages, calls, join requests): the
-- reader words those from the kind.
ALTER TABLE notifications ADD COLUMN summary TEXT;
ALTER TABLE notifications ADD COLUMN emoji TEXT;
