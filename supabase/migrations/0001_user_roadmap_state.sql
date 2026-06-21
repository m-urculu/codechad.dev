-- Per-user, per-skill roadmap state: the generated snowflake tree (with lazily
-- expanded children) and per-node objective progress. One row per (user, skill).
--
--   progress shape: { "<nodeId>": { "passed": ["o1","o2"], "done": true,
--                                    "objectives": [{id,description}], "title": "..." } }

create table if not exists public.user_roadmap_state (
  user_id    uuid not null,
  skill      text not null,
  level      text,
  goal       text,
  tree       jsonb not null default '[]'::jsonb,
  progress   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, skill)
);

-- Match the app's existing posture (anon-key server writes with explicit user_id).
grant all on public.user_roadmap_state to anon, authenticated, service_role;
