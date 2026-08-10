-- ============================================================
--  Book Nook Lane — lock down the database
--  Run ONCE: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--
--  Before running, make sure you have an admin account:
--    Authentication -> Users -> Add user -> email + password -> Auto Confirm
--
--  And make sure nobody else can make one:
--    Authentication -> Providers -> Email -> turn OFF "Enable sign ups"
--
--  That second step matters. Any account that exists gets the
--  "authenticated" role, and these policies give that role full write
--  access. Open signups would undo everything below.
-- ============================================================


-- 1. Columns the public website needs -------------------------------------

alter table public.events add column if not exists published  boolean not null default false;
alter table public.events add column if not exists signup_url text;
alter table public.events add column if not exists age_range  text;

-- Everything already in the table stays hidden until it's ticked Published.
-- To publish all existing events instead, run this line on its own afterwards:
--   update public.events set published = true;


-- 2. Remove every policy currently on these tables -------------------------
--    (the old ones were "USING (true)" — anyone with the anon key could write)

do $$
declare p record;
begin
  for p in
    select policyname, tablename
      from pg_policies
     where schemaname = 'public'
       and tablename in ('books', 'sales', 'events', 'site_content')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;


-- 3. Row level security on ------------------------------------------------

alter table public.books  enable row level security;
alter table public.sales  enable row level security;
alter table public.events enable row level security;


-- 4. Private tables — signed-in admin only, no public access at all --------

create policy "books admin" on public.books
  for all to authenticated using (true) with check (true);

create policy "sales admin" on public.sales
  for all to authenticated using (true) with check (true);


-- 5. Events — the public may read published rows and nothing else ----------

create policy "events public read" on public.events
  for select to anon using (published = true);

create policy "events admin" on public.events
  for all to authenticated using (true) with check (true);


-- 6. site_content — only if the table actually exists ----------------------

do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'site_content'
  ) then
    execute 'alter table public.site_content enable row level security';
    execute 'create policy "site_content public read" on public.site_content
               for select to anon using (true)';
    execute 'create policy "site_content admin" on public.site_content
               for all to authenticated using (true) with check (true)';
  end if;
end $$;


-- 7. Check the result ------------------------------------------------------
--    Expect: books/sales -> authenticated only.
--            events -> one anon SELECT policy + one authenticated ALL policy.

select tablename, policyname, roles, cmd
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;
