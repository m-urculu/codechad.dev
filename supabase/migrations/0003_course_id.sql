-- Give every course its own identity so one technology can hold several courses
-- (the "Duplicate course" feature). Previously the primary keys were
-- (user_id, skill) and (user_id, module), which made a second Python course
-- impossible to represent.
--
-- After this migration:
--   * user_roadmap_state is keyed by course_id (uuid)
--   * user_chat_state is keyed by course_id too, so each course keeps its own
--     tutor conversation
--   * roadmap rows carry `module` (the runtime id) and `name` (the display
--     label, which the user can edit and which duplicates disambiguate)
--
-- Safe to run more than once. Existing rows are preserved and backfilled.

-- ---------------------------------------------------------------------------
-- 1. user_roadmap_state: new columns
-- ---------------------------------------------------------------------------

alter table public.user_roadmap_state
  add column if not exists course_id  uuid not null default gen_random_uuid(),
  add column if not exists module     text,
  add column if not exists name       text,
  add column if not exists created_at timestamptz not null default now();

-- `name` defaults to the technology title for every pre-existing course.
update public.user_roadmap_state set name = skill where name is null;

-- Backfill `module` from the skill title. This map mirrors RUNTIMES in
-- src/lib/runtimes/registry.ts; it is only needed for rows created before this
-- migration, because the app writes `module` explicitly from now on.
update public.user_roadmap_state s
set    module = m.module
from  (values
         ('JavaScript',        'javascript'),
         ('TypeScript',        'typescript'),
         ('Python',            'python'),
         ('Ruby',              'ruby'),
         ('PHP',               'php'),
         ('Lua',               'lua'),
         ('PostgreSQL',        'postgres'),
         ('SQLite',            'sqlite'),
         ('DuckDB',            'duckdb'),
         ('React',             'react'),
         ('Vue',               'vue'),
         ('WebAssembly',       'wasm'),
         ('Three.js / WebGPU', 'graphics'),
         ('AI / ML',           'ml')
      ) as m(skill, module)
where  s.module is null
  and  s.skill = m.skill;

-- ---------------------------------------------------------------------------
-- 2. user_chat_state: adopt course_id
-- ---------------------------------------------------------------------------

alter table public.user_chat_state
  add column if not exists course_id uuid;

-- Attach each existing conversation to the matching course. Pre-migration there
-- was at most one course per (user, module), so this join is unambiguous.
update public.user_chat_state c
set    course_id = s.course_id
from   public.user_roadmap_state s
where  c.course_id is null
  and  c.user_id = s.user_id
  and  c.module  = s.module;

-- A conversation whose course row no longer exists is unreachable once chat is
-- keyed by course_id — drop it rather than leave an orphan holding a null key.
delete from public.user_chat_state where course_id is null;

-- ---------------------------------------------------------------------------
-- 3. Swap the primary keys
-- ---------------------------------------------------------------------------

alter table public.user_roadmap_state drop constraint if exists user_roadmap_state_pkey;
alter table public.user_roadmap_state add  constraint user_roadmap_state_pkey primary key (course_id);

alter table public.user_chat_state drop constraint if exists user_chat_state_pkey;
alter table public.user_chat_state alter column course_id set not null;
alter table public.user_chat_state add  constraint user_chat_state_pkey primary key (course_id);

-- ---------------------------------------------------------------------------
-- 4. Indexes for the lookups the app actually performs
-- ---------------------------------------------------------------------------

create index if not exists user_roadmap_state_user_idx        on public.user_roadmap_state (user_id, updated_at desc);
create index if not exists user_roadmap_state_user_skill_idx  on public.user_roadmap_state (user_id, skill);
create index if not exists user_chat_state_user_idx           on public.user_chat_state (user_id);

-- ---------------------------------------------------------------------------
-- 5. Grants / RLS posture unchanged (anon-key server writes with explicit user_id)
-- ---------------------------------------------------------------------------

grant all on public.user_roadmap_state to anon, authenticated, service_role;
grant all on public.user_chat_state    to anon, authenticated, service_role;

alter table public.user_roadmap_state disable row level security;
alter table public.user_chat_state    disable row level security;
