# Payments — setup and operation

**Status:** implemented, unconfigured. **Written:** 28 July 2026.

The code is complete and mode-agnostic: test keys and live keys run the same paths. What
follows is the part that cannot be done from a repository — creating the Stripe account,
the product and the webhook, and pasting four values into the environment.

Until `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` are set, **billing is invisible**. The
account page hides its subscription section, `/pricing` shows an "unavailable" notice, and
the billing routes answer `503`. Nothing in the free product changes. This is deliberate:
a half-configured payment system must fail closed and quietly, not half-work.

---

## What it sells

One thing. Free accounts keep **3 courses**; the subscription removes the ceiling.
Everything that teaches — every technology, every career path, the tutor, the editor, the
grading — stays free on both tiers.

The limit is `FREE_COURSE_LIMIT` in `src/lib/stripe.ts`, and it is enforced server-side at
**both** creation points (`POST /api/roadmap/state` and the `duplicate` action), because a
limit enforced at one of two doors is not a limit.

Going over the limit and then lapsing does **not** lock anything: existing courses stay
editable, you simply cannot add another. Taking away work someone already did would be a
punishment, not a limit.

---

## Setup

### 1. Stripe account

Create one at [dashboard.stripe.com](https://dashboard.stripe.com). For **live** mode you
must complete activation: legal entity, address, bank account and tax details. Portugal
established → Stripe will ask for NIF.

### 2. The product and price

Products → **+ Add product**. A recurring monthly price, in EUR. Copy the **price id**
(`price_…`, *not* the product id).

Prices are read from Stripe at render time by `/pricing`, never hard-coded — a number
typed into a page is a number that will one day disagree with what the customer is
actually charged, and that gap is a consumer-law problem rather than a typo.

### 3. Stripe Tax

Settings → Tax → **enable**, and set the origin address to Portugal. Checkout is created
with `automatic_tax: { enabled: true }` and `tax_id_collection`, so:

- consumers are charged **their own country's** VAT rate (a digital service is taxed where
  the customer is — without this a German sale is charged Portuguese VAT and the return is
  wrong);
- EU businesses entering a VAT number get the **reverse charge**, validated against VIES;
- the billing address is collected as the primary piece of **location evidence** the VAT
  rules require. Stripe stores it, and the webhook copies the country into
  `billing_customers.country`.

### 4. The webhook

Developers → Webhooks → **Add endpoint**:

- URL: `https://www.codechad.dev/api/billing/webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
  `invoice.payment_failed`

Copy the **signing secret** (`whsec_…`).

> The webhook is the only writer of `subscriptions`, and its signature is its entire
> authentication — Stripe has no Supabase session. Get the secret wrong and every payment
> silently fails to grant anything.

### 5. Environment

Four values, in Vercel (Production) and `.env.local` for development:

```
STRIPE_SECRET_KEY=sk_live_…        # or sk_test_… — server-only, NEVER NEXT_PUBLIC_
STRIPE_PRICE_ID=price_…
STRIPE_WEBHOOK_SECRET=whsec_…
NEXT_PUBLIC_SITE_URL=https://www.codechad.dev
```

`STRIPE_SECRET_KEY` is a bearer token for money. `src/lib/stripe.ts` is `server-only` for
the same reason `supabaseAdmin.ts` is, except the blast radius here is charges and refunds
rather than rows.

There is **no publishable key**, because nothing needs one — see below.

### 6. Migration

Apply `supabase/migrations/0008_billing.sql`, then run `npm run check:erasure`. It must
report user content erased **and** billing retained. Both halves, or the migration is
wrong.

### 7. Local testing

```bash
stripe login
stripe listen --forward-to localhost:3000/api/billing/webhook   # prints a whsec_ to use
stripe trigger checkout.session.completed
```

Test cards: `4242 4242 4242 4242` succeeds, `4000 0025 0000 3155` forces a 3DS challenge,
`4000 0000 0000 9995` declines.

---

## Architecture, and the one decision that is expensive to reverse

**Checkout is a full redirect to Stripe's domain. Never embed Elements.**

The usual argument is PCI scope. Here there is a sharper one. PCI DSS 4.0.1 requirements
**6.4.3** and **11.6.1** apply even to SAQ A merchants: every script on the *payment page*
must be inventoried, authorised, integrity-assured and monitored for tampering.

Now recall what this app's pages load — roughly **20 references to jsDelivr**, plus unpkg,
plus Hugging Face model weights, plus WASM toolchains fetched at run time. Putting Elements
on a page of this application would drag that entire, deliberately dynamic script surface
into PCI scope, and the SAQ A eligibility statement — that the site is not susceptible to
scripts affecting the payment environment — could not be made honestly.

Redirecting means **no payment form is ever served by us**, no Stripe JS loads on our
pages, and a PAN never touches this server. It cannot leak from here because it never
arrives.

`/pricing` carries the **script inventory 6.4.3 asks for**, in a comment at the top of the
file, and it is currently: the Next.js bundle, the checkout component, the Supabase
browser client, and nothing else. A test asserts the rendered page contains no external
`src`. Anything added to that page must be checked against the list first.

---

## Consumer law, and where each piece lives

### Withdrawal (CRD Art. 11a, in force 19 June 2026)

An online interface where a withdrawal right exists must carry a **withdrawal function**:
clearly labelled, available **throughout** the 14 days, leading to a **structured two-step
confirmation**, producing an **automatic confirmation** to the consumer. "Email us to
cancel" does not comply, and neither does a PDF form.

| Requirement | Where |
|---|---|
| Clearly labelled control | `BillingSection.tsx` — "Withdraw from the contract here" |
| Available throughout the window | `withdrawalOpen` computed **live** on every read in `lib/billing.ts`, never cached into a flag that can go stale |
| Two-step confirmation | The button arms; `POST /api/billing/withdraw` refuses without `confirm: true` |
| Automatic confirmation | Stripe's refund email (a durable medium), plus an on-screen `WD-…` reference |

This is **not** the same control as cancelling, and both exist:

- **Manage or cancel** → Stripe's portal. Ends at period end; they keep what they paid for.
- **Withdraw** → unwinds the contract *now* and refunds the unused part, pro rata.

### The two affirmations at checkout (CRD Art. 16(m))

Two separate, unticked checkboxes on `/pricing`: *start immediately*, and *I understand
what starting immediately costs me*. Two statements, so two boxes — a combined one records
a consent never separately given, and a pre-ticked one records none at all. Both are stored
on the subscription row **and** in Stripe metadata, so "did this person consent?" has two
independent answers.

Requiring them does **not** extinguish the withdrawal right. The right lapses only once the
service is *fully performed*, and a monthly subscription never is within its own first
fortnight — which is why the withdrawal function is offered regardless.

### Cancellation UX (§9.6)

Stripe's portal, deliberately: no retention maze, no discount interception, no
confirmshaming. Cancelling must not be harder than subscribing, and the **Digital Fairness
Act** is aimed squarely at flows that make it so.

### Erasure vs invoices (§9.7)

The one place the previous design would have broken a promise it already made.

`billing_customers` and `subscriptions` are the **only** tables that do not cascade from
`auth.users`. Their FK is `on delete set null`: the row survives, `user_id` goes null.
Article 17(3)(b) plus ten-year Portuguese invoice retention require the record; blanking
the user id means it can no longer identify anyone.

A cascade here would have destroyed tax records at the exact moment nobody was watching —
an account deletion — and it would have looked like success. `npm run check:erasure`
asserts **both** directions, so "everything was deleted" now *fails*.

Deleting an account also **cancels any live subscription at period end** first
(`api/account/route.ts`). Without that, deletion would leave a subscription charging
monthly against an account the person can no longer sign into to stop it.

---

## What is still yours to do

Code cannot discharge these.

| | |
|---|---|
| **VAT registration** | Below €10,000/year cross-border B2C you may charge Portuguese VAT on everything. Above it, register for **OSS** — one quarterly return for the EU. Stripe Tax computes the rates either way; it does not file for you. |
| **Invoice retention** | 10 years, Portuguese rules. Stripe is the system of record — do not close the account. |
| **Stripe DPA** | Applies on accepting their terms. Review the sub-processor list. |
| **Privacy policy** | Already updated with Stripe as a recipient and the retention carve-out. Re-check when the plan changes. |
| **Test the live flow once** | With a real card, for a real euro, then refund it. Nothing else proves the live keys, the live webhook and the live tax settings agree. |

The last one is the gap that matters. Everything here was verified against test keys and
offline signatures: 21/21 on entitlement and degradation, 6/6 on webhook signature
handling including a rejected forged-entitlement payload. **No live charge has ever been
made through this code.**
