-- Run this once in your Supabase project's SQL Editor to add descriptor-field support
-- (Title/Artist/Genre-style custom fields per object) to an already-live database.

create table if not exists fields (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists object_field_values (
  object_id uuid not null references ranked_objects(id) on delete cascade,
  field_id uuid not null references fields(id) on delete cascade,
  board_id uuid not null references boards(id) on delete cascade,
  value text not null default '',
  primary key (object_id, field_id)
);

create index if not exists fields_board_id_idx on fields (board_id);
create index if not exists object_field_values_board_id_idx on object_field_values (board_id);

alter table fields enable row level security;
alter table object_field_values enable row level security;

create policy "public full access" on fields for all using (true) with check (true);
create policy "public full access" on object_field_values for all using (true) with check (true);

alter publication supabase_realtime add table fields;
alter publication supabase_realtime add table object_field_values;

-- ranked_objects.name is superseded by field values; the app no longer reads or writes
-- it, but it's left in place (now optional) rather than dropped, so no existing data is
-- destroyed if this migration needs to be revisited.
alter table ranked_objects alter column name drop not null;

-- Migrate existing data: give every board that already has objects a "Name" field,
-- and carry each object's current `name` into that field's value so nothing is lost.
do $$
declare
  b record;
  new_field_id uuid;
begin
  for b in select distinct board_id from ranked_objects loop
    insert into fields (board_id, name) values (b.board_id, 'Name') returning id into new_field_id;
    insert into object_field_values (object_id, field_id, board_id, value)
      select id, new_field_id, b.board_id, coalesce(name, '') from ranked_objects where board_id = b.board_id;
  end loop;
end $$;
