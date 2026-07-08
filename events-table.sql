-- One-time setup for the Events page.
-- Run this in Supabase: Dashboard → SQL Editor → New query → paste → Run.

create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  date       date not null,
  time       text,
  location   text,
  tagline    text,
  details    text,
  contact    text,
  template   text,
  color      text,
  created_at timestamptz default now()
);

alter table events enable row level security;

drop policy if exists "events anon access" on events;
create policy "events anon access" on events
  for all using (true) with check (true);
