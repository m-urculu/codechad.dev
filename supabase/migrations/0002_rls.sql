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
--   1. apply 0001
--   2. add SUPABASE_SERVICE_ROLE_KEY to Vercel and .env.local
--   3. move every server-side createClient onto that key
--   4. then apply this file

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
