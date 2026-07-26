-- Tables the code already queries but which do not exist in the database.
--
-- Every one of these currently returns:
--   404  Could not find the table 'public.<name>' in the schema cache
-- which is why /api/user-steps/register 500s on every sign-in.
--
-- Column types are taken from the call sites, not guessed:
--   user_step_fulfillment  api/supabase/user-steps.ts, api/sys-manager/route.ts
--   chat_messages          api/supabase/chat-message.ts
--   user_roadmaps          api/functions/roadmap/index.ts
--   roadmaps               api/functions/roadmap/index.ts
--
-- Safe to run as-is: it only adds tables. RLS is deliberately NOT enabled here —
-- see 0002_rls.sql, which must not be applied until the server routes stop using
-- the anon key.

-- One row per user, tracking which onboarding steps are done.
-- Written with .upsert(..., { onConflict: 'user_id' }), so user_id must be unique.
create table if not exists public.user_step_fulfillment (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  define_roadmaps_done   boolean not null default false,
  define_project_done    boolean not null default false,
  course_nodes_gen_done  boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Chat history. Read back with .order('created_at').limit(n), so it is indexed
-- on exactly that.
create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('user', 'assistant', 'system')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at);

-- The roadmap archetype a user picked.
-- .upsert({ user_id, roadmap_key }) passes no onConflict, so the conflict target
-- is the primary key — which therefore has to be user_id alone.
create table if not exists public.user_roadmaps (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  roadmap_key  text not null,
  updated_at   timestamptz not null default now()
);

-- Reference content, not user data: the roadmap archetypes themselves, looked up
-- by .eq('key', ...).single().
create table if not exists public.roadmaps (
  key          text primary key,
  title        text,
  description  text,
  content      jsonb,
  created_at   timestamptz not null default now()
);
