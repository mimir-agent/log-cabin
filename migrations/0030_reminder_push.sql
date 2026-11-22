-- Reminders that push through quiet hours, and the inbox saying when a schedule held one.
-- Adds only.

-- A reminder someone sets for themselves is a request for that time, so it pushes through
-- their notification schedule and pauses unless they turn that off for it. Existing reminders
-- keep that default.
ALTER TABLE follow_ups ADD COLUMN notify_anyway INTEGER NOT NULL DEFAULT 1;

-- When the notification was made while the person's schedule or a pause held push and email.
-- Null for every notification made before this column, and for any that was not held. It is
-- its own column: emailed_at also means "emailed", and is set for held rows only to keep them
-- out of the unread email.
ALTER TABLE notifications ADD COLUMN held_at INTEGER;
