-- Billing: the Stripe customer handle, and the subscription's state as we last saw it.
--
-- THE ONE THING TO UNDERSTAND ABOUT THIS MIGRATION: unlike every other table in this
-- schema, these rows do NOT cascade from auth.users. That is deliberate and it is the
-- single most consequential decision in the payment work — docs/gdpr-and-compliance.md
-- §9.7 calls it out as far cheaper to design in than to retrofit.
--
-- Every other table here carries `on delete cascade` because the privacy policy promises
-- erasure and Article 17 requires it. Billing is the documented exception: Article 17(3)(b)
-- carves out processing required to comply with a legal obligation, and Portuguese tax law
-- requires invoices to be retained for ten years. A cascade here would silently destroy
-- records the operator is legally required to keep, and it would do it at the exact moment
-- nobody is looking — an account deletion.
--
-- So the FK is `on delete set null`. When an account is erased:
--   * user_id  -> null, so the row can no longer be used to identify or profile anyone;
--   * stripe_customer_id survives, because it is the key to the invoice Stripe holds and
--     the tax record is worthless without it.
--
-- This is not a loophole to keep data by. It is the minimum that survives, it survives for
-- one stated reason, and the privacy policy says so in terms — a user who deletes their
-- account and later receives an invoice must not be surprised.
--
-- Stripe remains the system of record for invoices and card data. Nothing here is a PAN,
-- a CVV or an expiry; they are opaque handles (`cus_…`, `sub_…`) plus status.

-- ---------------------------------------------------------------------------
-- 1. The customer handle. One Stripe customer per user, created at first checkout.
-- ---------------------------------------------------------------------------
create table if not exists public.billing_customers (
  stripe_customer_id text primary key,
  -- NOT `on delete cascade`. See the header. Nullable so erasure can blank it.
  user_id            uuid references auth.users (id) on delete set null,
  email              text,          -- as given to Stripe, for reconciling an orphaned row
  country            text,          -- billing country: the VAT evidence, and why we keep it
  created_at         timestamptz not null default now()
);

create index if not exists billing_customers_user_idx on public.billing_customers (user_id);

-- ---------------------------------------------------------------------------
-- 2. Subscription state, mirrored from Stripe by the webhook.
-- ---------------------------------------------------------------------------
-- This table is a CACHE of Stripe's truth, not a second source of it. The webhook
-- writes it; nothing else may. Entitlement is read from here because checking it on
-- every request by calling Stripe would put their availability in front of the app's.
create table if not exists public.subscriptions (
  stripe_subscription_id text primary key,
  stripe_customer_id     text not null,
  user_id                uuid references auth.users (id) on delete set null,
  -- Stripe's own vocabulary, stored verbatim rather than mapped to something of ours:
  -- trialing, active, past_due, canceled, incomplete, incomplete_expired, unpaid, paused.
  status                 text not null,
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  -- When the contract STARTED, which is what the 14-day withdrawal window counts from.
  -- Not the same as current_period_start, which moves on every renewal.
  started_at             timestamptz not null default now(),
  -- Consumer Rights Directive Art. 16(m): the withdrawal right is only lost if the
  -- consumer expressly requested immediate performance AND acknowledged the loss. Two
  -- separate affirmations, so two separate columns — collapsing them into one boolean
  -- would record a consent that was never given.
  immediate_start_requested   boolean not null default false,
  withdrawal_right_acknowledged boolean not null default false,
  -- Set when the consumer uses the Art. 11a withdrawal function.
  withdrawn_at           timestamptz,
  withdrawal_reference   text,
  updated_at             timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id, status);
create index if not exists subscriptions_customer_idx on public.subscriptions (stripe_customer_id);

-- ---------------------------------------------------------------------------
-- 3. RLS: same posture as every other table (0005). Server-only writes.
-- ---------------------------------------------------------------------------
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;

-- A signed-in user may read their OWN subscription — the account page shows its status.
-- There is deliberately no insert/update policy for anyone: only the webhook, running as
-- the service role, may write here. A client that could write its own `status` could
-- grant itself the paid tier.
create policy subscriptions_own on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- billing_customers gets NO select policy at all. It holds nothing the user needs to see
-- and it is the join key to their invoices; the account page reads subscriptions instead.

revoke all on public.billing_customers from anon, authenticated;
revoke all on public.subscriptions from anon;
grant select on public.subscriptions to authenticated;
