-- ============================================================
--  Book Nook Lane — pictures
--  Run ONCE: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--
--  Adds:
--    * a `photos` table — one row per picture she uploads
--    * `events.photo_id` — the cover picture for an event
--    * a public storage bucket called `photos` to hold the image files
--
--  The security shape matches the rest of the project: the public site
--  may READ, and only a signed-in admin may write. Image files themselves
--  live in a public bucket, so they load on the website without a key —
--  but nobody can upload or delete without signing in.
-- ============================================================


-- 1. The table ------------------------------------------------------------

create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  path        text not null unique,        -- object path inside the `photos` bucket
  thumb_path  text,                        -- smaller copy used in grids
  caption_en  text,
  caption_it  text,
  on_shelf    boolean not null default false,   -- show in the "From our shelves" band
  sort        integer not null default 0,       -- lower numbers first
  width       integer,
  height      integer,
  created_at  timestamptz not null default now()
);

comment on table public.photos is
  'Pictures uploaded in the admin Photos page. Files live in the `photos` storage bucket; this table holds captions and where each picture is used.';

create index if not exists photos_shelf_idx on public.photos (on_shelf, sort, created_at desc);


-- 2. Event cover picture --------------------------------------------------

alter table public.events
  add column if not exists photo_id uuid references public.photos(id) on delete set null;

-- on delete set null: deleting a picture must never delete an event.


-- 3. Optional single-picture slots on the website -------------------------
--    Stored as site_content rows so the Website page can edit them with
--    the same machinery as the text. value_en holds a photos.id.

insert into public.site_content (key, value_en, value_it)
  values ('about_photo', null, null), ('shelf_intro', null, null)
  on conflict do nothing;


-- 4. Row level security ---------------------------------------------------

alter table public.photos enable row level security;

drop policy if exists "photos public read" on public.photos;
drop policy if exists "photos admin"       on public.photos;

create policy "photos public read" on public.photos
  for select to anon using (true);

create policy "photos admin" on public.photos
  for all to authenticated using (true) with check (true);


-- 5. The storage bucket ---------------------------------------------------
--    public = true means the image URLs work without a key, which is what
--    a website needs. Writing is still policy-controlled below.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880,
        array['image/webp','image/jpeg','image/png','image/gif'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- 6. Who may put files in it ----------------------------------------------

drop policy if exists "photos bucket admin write"  on storage.objects;
drop policy if exists "photos bucket admin update" on storage.objects;
drop policy if exists "photos bucket admin delete" on storage.objects;

create policy "photos bucket admin write" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');

create policy "photos bucket admin update" on storage.objects
  for update to authenticated using (bucket_id = 'photos') with check (bucket_id = 'photos');

create policy "photos bucket admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'photos');


-- 7. Check the result -----------------------------------------------------

select tablename, policyname, roles, cmd
  from pg_policies
 where (schemaname = 'public'  and tablename = 'photos')
    or (schemaname = 'storage' and policyname like 'photos bucket%')
 order by tablename, policyname;
