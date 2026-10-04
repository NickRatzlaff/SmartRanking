-- Run this once in your Supabase project's SQL Editor to add theme support
-- to a database that was already set up from the original schema.sql.
alter table boards add column if not exists theme text not null default 'default';

-- The boards table was never added to the realtime publication — needed now
-- so a theme change (or future board-level edits) syncs live to collaborators.
alter publication supabase_realtime add table boards;
