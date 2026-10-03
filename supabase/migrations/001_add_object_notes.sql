-- Run this once in your Supabase project's SQL Editor to add notes support
-- to a database that was already set up from the original schema.sql.
alter table ranked_objects add column if not exists notes text not null default '';
