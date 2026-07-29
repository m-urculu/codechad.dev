-- The skills ledger: what the learner has actually COMPLETED, independent of the
-- course it happened in.
--
-- Why a table rather than a query. Everything needed to compute this already lives
-- in user_roadmap_state.tree + .progress, and the first version of this feature did
-- compute it on demand. The problem is cost and shape: answering "what does this
-- person already know" would mean pulling every tree the user owns (each one a large
-- jsonb blob) on every single generation call — three of them per lesson. This table
-- is the same information reduced to the part a prompt can use, so the lookup is one
-- indexed read of short rows.
--
-- It is a CACHE, not a source of truth. user_roadmap_state remains authoritative;
-- syncCourseSkills() recomputes a course's rows from its tree whenever that course is
-- saved, and deletes the ones that no longer hold. Losing this table entirely would
-- cost nothing but a re-sync.
--
-- Granularity. One row per completed unit at the COARSEST level that is fully done:
-- a finished topic is one row, not thirty. A course in progress contributes its
-- finished sub-topics and lessons. See deriveSkills() in src/lib/skills.ts.
--
-- Deletion. course_id cascades: removing a course removes the knowledge it evidenced.
-- The alternative (orphan rows that outlive their course) means a learner who deletes
-- a course still has every future course silently shaped by it, with nothing in the
-- app that can show them why or let them undo it. Knowledge you cannot inspect is not
-- a feature.

create table if not exists public.user_skill (
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Normalized concept key — see skillKey(). Two courses that both finish
  -- "Error Handling" collapse to one row per technology.
  skill_key    text not null,
  -- Empty string rather than null: this is half the primary key, and a null there
  -- would let the same skill be inserted unboundedly.
  module       text not null default '',
  -- The human label, kept for the prompt and for any future "what you know" UI.
  -- Last writer wins; they are near-synonyms by construction.
  label        text not null,
  -- topic | subtopic | point — how much ground this row stands for. Coarse rows are
  -- worth more in a prompt than a single finished lesson, and they are what a
  -- DIFFERENT technology is allowed to see.
  kind         text not null check (kind in ('topic', 'subtopic', 'point')),
  technology   text,
  course_id    uuid references public.user_roadmap_state (course_id) on delete cascade,
  course_name  text,
  completed_at timestamptz not null default now(),
  primary key (user_id, module, skill_key)
);

-- The only read the app performs: everything this user knows, coarsest first.
create index if not exists user_skill_user_idx on public.user_skill (user_id, kind);
-- The sync path deletes by course before re-inserting.
create index if not exists user_skill_course_idx on public.user_skill (course_id);

-- Same posture as 0005: no anon access, RLS on, server routes reach it with the
-- service role. Nothing in the browser queries this table directly.
revoke all on public.user_skill from anon;
grant all on public.user_skill to authenticated, service_role;
alter table public.user_skill enable row level security;

drop policy if exists user_skill_own_rows on public.user_skill;
create policy user_skill_own_rows on public.user_skill
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
