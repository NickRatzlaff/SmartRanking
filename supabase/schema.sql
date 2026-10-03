-- Smart Ranking collaborative schema.
-- Run this once in your Supabase project's SQL Editor (Project -> SQL Editor -> New query).
--
-- Access model: no user accounts. A board's id is a random, unguessable UUID — knowing
-- the link is what grants access, the same way a shared Google Doc link works. RLS
-- policies below intentionally allow the anon (public) key to read/write any row, since
-- there is no per-user identity to check; the link itself is the access control.

create extension if not exists pgcrypto;

create table boards (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled Ranking',
  created_at timestamptz not null default now()
);

create table criteria (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  name text not null,
  weight int not null default 50,
  higher_is_better boolean not null default true,
  created_at timestamptz not null default now()
);

create table ranked_objects (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  name text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- board_id is denormalized here (also reachable via object_id -> ranked_objects.board_id)
-- so Supabase Realtime can filter change events by board_id directly, and so RLS doesn't
-- need a subquery join.
create table object_values (
  object_id uuid not null references ranked_objects(id) on delete cascade,
  criterion_id uuid not null references criteria(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  value numeric not null default 5,
  primary key (object_id, criterion_id)
);

create index on criteria (board_id);
create index on ranked_objects (board_id);
create index on object_values (board_id);

alter table boards enable row level security;
alter table criteria enable row level security;
alter table ranked_objects enable row level security;
alter table object_values enable row level security;

create policy "public full access" on boards for all using (true) with check (true);
create policy "public full access" on criteria for all using (true) with check (true);
create policy "public full access" on ranked_objects for all using (true) with check (true);
create policy "public full access" on object_values for all using (true) with check (true);

-- Stream inserts/updates/deletes on these tables to subscribed clients.
alter publication supabase_realtime add table criteria;
alter publication supabase_realtime add table ranked_objects;
alter publication supabase_realtime add table object_values;
