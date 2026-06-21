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
