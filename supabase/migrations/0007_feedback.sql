-- Feedback from the floating button (src/components/FeedbackButton.tsx).
--
-- Anonymous feedback is allowed on purpose: a visitor who bounces off the trial has
-- the most useful thing to say and the least reason to make an account first. So
-- user_id is NULLABLE, and everything else has to work without it.
--
-- `on delete cascade` matches every other table here, and matches what the privacy
-- policy promises: deleting an account erases the user's data, full stop. The
-- alternative — `set null`, keeping the text and dropping the link — would preserve
-- more signal, but a free-text box can contain anything the writer chose to put in
-- it, so de-linking is not the same as anonymising. Consistency with the promise
-- already made wins.

create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete cascade,   -- null = anonymous
  email      text,          -- optional, only if the sender typed one for a reply
  kind       text not null default 'general'
             check (kind in ('bug', 'idea', 'confusing', 'general')),
  message    text not null check (length(btrim(message)) between 1 and 4000),
  -- Where they were when they wrote it. Worth far more than the message alone:
  -- "this is confusing" means something different on a Docker lesson than on the
  -- landing page.
  context    jsonb not null default '{}'::jsonb,  -- { module, courseId, lessonId, path }
  created_at timestamptz not null default now()
);

-- The only query the operator runs: newest first.
create index if not exists feedback_created_idx on public.feedback (created_at desc);
-- "What did this user say?" when answering a support email.
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;

-- Writes go through /api/feedback as the service role (which bypasses RLS), the same
-- posture as every other table — see 0005. This policy exists so a signed-in user can
-- read back WHAT THEY SENT and nothing else, should the app ever offer that. There is
-- deliberately no policy for anon: an unauthenticated caller can neither read the
-- table nor write to it directly, only through the rate-limited route.
create policy feedback_own on public.feedback
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Same grant posture as the other tables: nothing for anon.
revoke all on public.feedback from anon;
grant select on public.feedback to authenticated;
