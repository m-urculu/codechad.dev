-- Row Level Security.
--
-- DO NOT RUN THIS YET. It will break the app in its current shape. Read on.
--
-- The problem it fixes. The anon key is not a secret — it ships inside the
-- browser bundle, and anyone can read it out of the page. Today it is enough to
-- read every row of every user's data:
--
--   curl "$URL/rest/v1/user_roadmap_state?select=*" -H "apikey: <anon key>"
--   -> the whole table
--
-- Verified against the live project on 2026-07-26: both existing tables returned
-- all rows to an unauthenticated caller. That is harmless while you are the only
-- account and becomes a data breach on the day a second person signs up.
--
-- Why it cannot be applied yet. The server routes also authenticate with the
-- anon key (api/supabase/*.ts, api/sys-manager/route.ts, api/functions/roadmap).
-- Under the policies below, anon carries no auth.uid(), so every one of those
-- queries would start returning zero rows. The routes must first be switched to
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS by design and must only ever be
-- read server-side — never NEXT_PUBLIC_, never imported into a component.
--
-- Order of operations:
--   1. apply 0004                                                        [done]
--   2. add SUPABASE_SERVICE_ROLE_KEY to Vercel and .env.local            [done]
--   3. move every server-side createClient onto that key                 [done]
--   4. then apply this file                                              <- now
--
-- Measured state before applying, anon key against the live project:
--
--   user_step_fulfillment  200 []    RLS already on (Supabase enables it for
--   chat_messages          200 []    new tables); the service role still reads
--   user_roadmaps          200 []    the rows, so 0004's tables are already shut
--   roadmaps               200 []
--   user_roadmap_state     200 rows  RLS off — the exposure this file closes
--   user_chat_state        200 rows  RLS off — likewise
--
-- So the `enable row level security` lines below are no-ops on four of six
-- tables. They stay for the sake of a schema that states its own intent rather
-- than one that depends on what a dashboard happened to do.
--
-- Also measured: no browser code queries any table. Every read and write goes
-- through an API route, and those now authenticate with the service role, which
-- bypasses RLS. Nothing user-facing depends on the policies below — they exist
-- so that direct queries from the browser would be safe if they are ever added.
--
-- Note that 0001-0003 did not merely leave RLS off, they turned it off and
-- granted anon full access explicitly:
--   grant all on public.user_roadmap_state to anon, authenticated, service_role;
--   alter table public.user_roadmap_state disable row level security;
-- So this file has to undo both halves — enabling RLS alone would leave the
-- grants in place for any table that later gains a permissive policy.

revoke all on public.user_roadmap_state from anon;
revoke all on public.user_chat_state    from anon;

alter table public.user_roadmap_state     enable row level security;
alter table public.user_chat_state        enable row level security;
alter table public.user_step_fulfillment  enable row level security;
alter table public.chat_messages          enable row level security;
alter table public.user_roadmaps          enable row level security;
alter table public.roadmaps               enable row level security;

-- Per-user tables: you may touch your own row, and no other.
-- One policy per table rather than a loop, so each is greppable by name.

create policy user_roadmap_state_own on public.user_roadmap_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy user_chat_state_own on public.user_chat_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy user_step_fulfillment_own on public.user_step_fulfillment
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy chat_messages_own on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy user_roadmaps_own on public.user_roadmaps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reference content: readable by anyone signed in or not, writable by no one
-- through the API. Seeded with the service role or from the SQL editor.
create policy roadmaps_read on public.roadmaps
  for select using (true);

-- Verification. Every row should read rls = true after this file is applied.
-- select relname as table, relrowsecurity as rls
--   from pg_class
--  where relnamespace = 'public'::regnamespace and relkind = 'r'
--  order by relname;
