-- Per-user, per-module chat persistence: the conversation (capped) + calibration,
-- restored when the user reopens the module. One row per (user, module).

create table if not exists public.user_chat_state (
  user_id    uuid not null,
  module     text not null,
  messages   jsonb not null default '[]'::jsonb,
  calib      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, module)
);

grant all on public.user_chat_state to anon, authenticated, service_role;

-- Match user_roadmap_state's posture: the app persists chat server-side with the
-- anon key + an explicit user_id (not the user's JWT), so RLS keyed to auth.uid()
-- would reject those writes. RLS is therefore disabled here, same as the roadmap
-- table. (If this table was created via the dashboard, RLS may be ON by default —
-- this line makes the intended state explicit.)
alter table public.user_chat_state disable row level security;
