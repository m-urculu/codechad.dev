-- The syntax ledger: which pieces of syntax each learner has been shown, so lessons
-- explain a piece of syntax properly the first time and stop repeating it after.
-- See src/lib/syntax.ts.
--
-- One row per (syntax, lesson). How many lessons a piece of syntax appeared in is
-- what makes it fade, and keying by lesson makes recording idempotent: revisiting a
-- lesson re-sends the same rows and changes nothing.
--
-- Rows are written only after the lesson's reference solution has been validated in
-- the browser, so they describe code that actually ran.
--
-- Deletion follows user_skill (0009): course_id cascades, so deleting a course
-- removes what it showed, and user_id cascades with the account.

create table if not exists public.user_syntax (
  user_id    uuid not null references auth.users (id) on delete cascade,
  module     text not null default '',
  -- syntaxKey(): the token with whitespace removed.
  syntax_key text not null,
  -- The roadmap point (lesson) it was shown in.
  point_id   text not null,
  token      text not null,
  doc        text not null,
  course_id  uuid references public.user_roadmap_state (course_id) on delete cascade,
  seen_at    timestamptz not null default now(),
  primary key (user_id, module, syntax_key, point_id)
);

-- The only read: everything this user has seen in one technology.
create index if not exists user_syntax_user_module_idx on public.user_syntax (user_id, module);
create index if not exists user_syntax_course_idx on public.user_syntax (course_id);

-- Same posture as 0005 and 0009: no anon access, RLS on, server routes use the
-- service role.
revoke all on public.user_syntax from anon;
grant all on public.user_syntax to authenticated, service_role;
alter table public.user_syntax enable row level security;

drop policy if exists user_syntax_own_rows on public.user_syntax;
create policy user_syntax_own_rows on public.user_syntax
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
