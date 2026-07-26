-- Two fixes to what 0005 left behind.
--
-- 1. The original tables have no link to auth.users.
--
-- 0001 and 0002 declared user_id as a bare `uuid not null` — no foreign key, no
-- cascade. Deleting an account therefore leaves its roadmaps and chat history
-- behind forever, which contradicts what the privacy policy promises about
-- erasure. The tables from 0004 already have `on delete cascade`.
--
-- Orphans are cleared first, or the constraint cannot be validated. Check what
-- would go before running this:
--
--   select count(*) from public.user_roadmap_state s
--    where not exists (select 1 from auth.users u where u.id = s.user_id);
--
-- 2. Policy hygiene.
--
--   - `auth.uid()` bare is re-evaluated per row; wrapped in a subselect the
--     planner hoists it into an initPlan and runs it once per statement. On
--     chat_messages that is the difference that shows.
--   - No `to authenticated` meant the policies were also evaluated for anon,
--     which can never satisfy them.
--
-- Neither policy change alters who can read what. Access today runs through the
-- API routes as the service role, which bypasses RLS entirely; these policies
-- are what makes direct browser queries safe if they are ever added.

begin;

delete from public.user_roadmap_state s
 where not exists (select 1 from auth.users u where u.id = s.user_id);

delete from public.user_chat_state s
 where not exists (select 1 from auth.users u where u.id = s.user_id);

alter table public.user_roadmap_state
  add constraint user_roadmap_state_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.user_chat_state
  add constraint user_chat_state_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

-- Rewritten with the subselect form and an explicit role.
drop policy if exists user_roadmap_state_own    on public.user_roadmap_state;
drop policy if exists user_chat_state_own       on public.user_chat_state;
drop policy if exists user_step_fulfillment_own on public.user_step_fulfillment;
drop policy if exists chat_messages_own         on public.chat_messages;
drop policy if exists user_roadmaps_own         on public.user_roadmaps;
drop policy if exists roadmaps_read             on public.roadmaps;

create policy user_roadmap_state_own on public.user_roadmap_state
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_chat_state_own on public.user_chat_state
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_step_fulfillment_own on public.user_step_fulfillment
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy chat_messages_own on public.chat_messages
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_roadmaps_own on public.user_roadmaps
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Reference content: readable by anyone, written only by the service role.
create policy roadmaps_read on public.roadmaps
  for select to anon, authenticated using (true);

-- The four tables from 0004 kept the schema-default anon grants. 0005 revoked
-- them on the two older tables only; make the posture the same everywhere, so a
-- future permissive policy cannot quietly open one set and not the other.
revoke all on public.user_step_fulfillment from anon;
revoke all on public.chat_messages         from anon;
revoke all on public.user_roadmaps         from anon;

commit;
