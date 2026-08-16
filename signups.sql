-- ============================================================
--  Book Nook Lane — event sign-ups, built in
--
--  Replaces the Jotform. Families book on the website, the
--  booking lands here, and the Sign-ups page in admin shows
--  who is coming on which day and who still owes money.
--
--  Shaped after her Summer Reading form: one booking can cover
--  several sessions, each with its own number of participants
--  and its own price. Nothing is paid online — same as now,
--  "payment on the day of the activity".
--
--  Run ONCE: Supabase Dashboard -> SQL Editor -> New query
--            -> paste -> Run. Safe to run twice: nothing is
--            dropped that holds data, every step is idempotent.
--
--  Assumes security.sql has already been run.
-- ============================================================


-- ============================================================
-- 1. New columns on events
-- ============================================================
--  price         what one participant pays for this session. NULL = free.
--  capacity      how many participants fit. NULL = no limit.
--  spots_taken   maintained by a trigger — never write to it by hand.
--  signups_open  the off switch. Untick to stop taking bookings without
--                unpublishing the event, so it still shows on the website.

alter table public.events add column if not exists price        numeric(8,2);
alter table public.events add column if not exists capacity     integer;
alter table public.events add column if not exists spots_taken  integer not null default 0;
alter table public.events add column if not exists signups_open boolean not null default true;

alter table public.events drop constraint if exists events_signup_sane;
alter table public.events add  constraint events_signup_sane check (
      (capacity is null or capacity between 1 and 500)
  and (price    is null or price between 0 and 999)
);

comment on column public.events.spots_taken is
  'Participants booked (confirmed only). Maintained by trigger signup_items_sync — do not write to it.';
comment on column public.events.signups_open is
  'False stops new bookings for this event while leaving it visible on the website.';


-- ============================================================
-- 2. Tables
-- ============================================================

--  One row per family who filled the form in. These are exactly the
--  questions her Jotform asked, no more.
create table if not exists public.signups (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),

  full_name    text not null,
  email        text not null,
  phone        text not null,
  child_age    text not null,          -- free text: "6", "5 e 7", "quasi 8"
  first_visit  boolean not null,       -- "First time to visit us?"
  school       text not null,

  lang         text not null default 'en',   -- which language she booked in
  terms_at     timestamptz not null,         -- when the T&Cs box was ticked
  seen         boolean not null default false -- has mum looked at it yet
);

comment on table public.signups is
  'One row per submission of the public booking form. Written only by book_sessions().';

--  One row per session inside a booking. This is the join that lets a single
--  submission cover five different story times, the way her Jotform does.
create table if not exists public.signup_items (
  id            uuid primary key default gen_random_uuid(),
  signup_id     uuid not null references public.signups(id) on delete cascade,
  event_id      uuid not null references public.events(id)  on delete cascade,

  participants  integer not null default 1,
  unit_price    numeric(8,2),          -- price snapshot, so later edits don't rewrite history
  status        text not null default 'confirmed',

  paid          boolean not null default false,
  paid_at       timestamptz,

  unique (signup_id, event_id)
);

comment on table public.signup_items is
  'A booking line: this family, this session, this many participants. unit_price is frozen at booking time.';

alter table public.signup_items drop constraint if exists signup_items_sane;
alter table public.signup_items add  constraint signup_items_sane check (
      participants between 1 and 5
  and status in ('confirmed', 'cancelled')
);

create index if not exists signup_items_by_event  on public.signup_items (event_id);
create index if not exists signup_items_by_signup on public.signup_items (signup_id);
create index if not exists signups_recent         on public.signups (created_at desc);
create index if not exists signups_by_email       on public.signups (lower(email));


-- ============================================================
-- 3. Keep events.spots_taken in step
-- ============================================================
--  security definer so it may write to events, which the public role
--  is not allowed to touch.

create or replace function public.sync_event_spots ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
begin
  -- NEW is unassigned on DELETE and OLD on INSERT, so branch rather than
  -- touching both.
  if    tg_op = 'INSERT' then ids := array[new.event_id];
  elsif tg_op = 'DELETE' then ids := array[old.event_id];
  else  ids := array_remove(array[new.event_id, old.event_id], null);
  end if;

  update public.events e
     set spots_taken = coalesce((
           select sum(i.participants)
             from public.signup_items i
            where i.event_id = e.id
              and i.status = 'confirmed'
         ), 0)
   where e.id = any (ids);
  return null;
end $$;

drop trigger if exists signup_items_sync on public.signup_items;
create trigger signup_items_sync
  after insert or update or delete on public.signup_items
  for each row execute function public.sync_event_spots();

-- Supabase exposes every public function as an RPC endpoint. This one is
-- only ever meant to be fired by the trigger above, so take it off the API.
revoke all on function public.sync_event_spots() from public, anon, authenticated;

-- Backfill, in case rows already exist.
update public.events e
   set spots_taken = coalesce((
         select sum(i.participants) from public.signup_items i
          where i.event_id = e.id and i.status = 'confirmed'
       ), 0);


-- ============================================================
-- 4. Row level security
-- ============================================================
--  The public gets NO direct access to either table — not insert, not
--  select. Bookings arrive only through book_sessions() below, which
--  validates everything server-side. So somebody holding the publishable
--  key cannot read the guest list, cannot edit a booking, cannot delete
--  one, and cannot write a row that skips the capacity check.

alter table public.signups      enable row level security;
alter table public.signup_items enable row level security;

drop policy if exists "signups admin" on public.signups;
create policy "signups admin" on public.signups
  for all to authenticated using (true) with check (true);

drop policy if exists "signup items admin" on public.signup_items;
create policy "signup items admin" on public.signup_items
  for all to authenticated using (true) with check (true);


-- ============================================================
-- 5. The booking function
-- ============================================================
--  Everything the public form does goes through here. It runs as the
--  table owner, so it can write rows the anon role never could, but it
--  only ever writes rows that pass every check below.
--
--  p_items looks like:
--    [{"event_id":"uuid","participants":2}, {"event_id":"uuid","participants":1}]
--
--  Returns, on success:
--    {"ok":true,"booking_id":"uuid","total":70.00,"sessions":3}
--  On refusal:
--    {"ok":false,"error":"full","event":"Snail Brings the Mail","remaining":1}
--    {"ok":false,"error":"duplicate","event":"…"}   already booked with that email
--    {"ok":false,"error":"closed","event":"…"}      unpublished, closed or past
--    {"ok":false,"error":"invalid","field":"email"}
--    {"ok":false,"error":"throttled"}
--
--  Validation runs over every item BEFORE anything is written, so a
--  refusal never leaves half a booking behind.

create or replace function public.book_sessions (
  p_full_name   text,
  p_email       text,
  p_phone       text,
  p_child_age   text,
  p_first_visit boolean,
  p_school      text,
  p_lang        text,
  p_terms       boolean,
  p_hp          text,
  p_items       jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := btrim(coalesce(p_full_name, ''));
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_phone   text := btrim(coalesce(p_phone, ''));
  v_age     text := btrim(coalesce(p_child_age, ''));
  v_school  text := btrim(coalesce(p_school, ''));
  v_lang    text := case when p_lang = 'it' then 'it' else 'en' end;
  v_item    jsonb;
  v_eid     uuid;
  v_qty     integer;
  v_ev      record;
  v_count   integer;
  v_price   numeric(8,2);
  v_total   numeric(10,2) := 0;
  v_booking uuid;
begin
  -- --- honeypot: a hidden field no human ever sees, let alone fills in ---
  if coalesce(btrim(p_hp), '') <> '' then
    -- Answer as though it worked. A bot told "rejected" simply tries again.
    return jsonb_build_object('ok', true, 'booking_id', gen_random_uuid(), 'total', 0, 'sessions', 0);
  end if;

  -- --- the fields, exactly as her form asks for them, all required ---
  if p_terms is not true                                     then return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'terms');  end if;
  if char_length(v_name)   not between 2 and 80              then return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'name');   end if;
  if char_length(v_email)  not between 5 and 120
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$'
                                                             then return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'email');  end if;
  if char_length(v_phone)  not between 5 and 40              then return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'phone');  end if;
  if char_length(v_age)    not between 1 and 40              then return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'age');    end if;
  if char_length(v_school) not between 2 and 80              then return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'school'); end if;
  if p_first_visit is null                                   then return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'first_visit'); end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 20                     then return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'sessions'); end if;

  -- --- light throttle: five bookings an hour from one address is plenty ---
  select count(*) into v_count
    from public.signups s
   where lower(s.email) = v_email
     and s.created_at > now() - interval '1 hour';
  if v_count >= 5 then
    return jsonb_build_object('ok', false, 'error', 'throttled');
  end if;

  -- --- lock the events being booked, so two families can't both take the
  --     last seat at the same moment. A malformed id fails the cast here,
  --     which is just another way of saying the request was invalid. ---
  begin
    perform 1
       from public.events e
      where e.id in (
              select (i ->> 'event_id')::uuid
                from jsonb_array_elements(p_items) i
            )
      for update;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'sessions');
  end;

  -- --- validate every line before writing anything ---
  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_eid := (v_item ->> 'event_id')::uuid;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'sessions');
    end;

    v_qty := coalesce((v_item ->> 'participants')::integer, 0);
    if v_qty not between 1 and 5 then
      return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'participants');
    end if;

    select e.id, e.name, e.price, e.capacity, e.spots_taken,
           e.published, e.signups_open, e.date
      into v_ev
      from public.events e
     where e.id = v_eid;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'closed', 'event', 'unknown');
    end if;

    if not v_ev.published or not v_ev.signups_open or v_ev.date < current_date then
      return jsonb_build_object('ok', false, 'error', 'closed', 'event', v_ev.name);
    end if;

    if v_ev.capacity is not null and v_ev.spots_taken + v_qty > v_ev.capacity then
      return jsonb_build_object(
        'ok', false, 'error', 'full', 'event', v_ev.name,
        'remaining', greatest(v_ev.capacity - v_ev.spots_taken, 0));
    end if;

    -- already booked this session with this email?
    select count(*) into v_count
      from public.signup_items i
      join public.signups s on s.id = i.signup_id
     where i.event_id = v_eid
       and i.status = 'confirmed'
       and lower(s.email) = v_email;
    if v_count > 0 then
      return jsonb_build_object('ok', false, 'error', 'duplicate', 'event', v_ev.name);
    end if;
  end loop;

  -- --- everything checks out: write the booking ---
  insert into public.signups (full_name, email, phone, child_age, first_visit, school, lang, terms_at)
  values (v_name, v_email, v_phone, v_age, p_first_visit, v_school, v_lang, now())
  returning id into v_booking;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_eid := (v_item ->> 'event_id')::uuid;
    v_qty := (v_item ->> 'participants')::integer;

    select e.price into v_price from public.events e where e.id = v_eid;

    insert into public.signup_items (signup_id, event_id, participants, unit_price)
    values (v_booking, v_eid, v_qty, v_price);

    v_total := v_total + (coalesce(v_price, 0) * v_qty);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking,
    'total', v_total,
    'sessions', jsonb_array_length(p_items));
end $$;

-- Only the website and the admin may call it. Nobody may call it as an
-- arbitrary database user by accident.
revoke all on function public.book_sessions(text,text,text,text,boolean,text,text,boolean,text,jsonb) from public;
grant execute on function public.book_sessions(text,text,text,text,boolean,text,text,boolean,text,jsonb) to anon, authenticated;


-- ============================================================
-- 6. Check the result
-- ============================================================
--  Expect: signups and signup_items -> one authenticated ALL policy each,
--  and NO anon policy anywhere. That is deliberate.

select tablename, policyname, roles, cmd
  from pg_policies
 where schemaname = 'public' and tablename in ('signups', 'signup_items')
 order by tablename, policyname;
