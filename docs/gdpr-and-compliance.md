# GDPR and compliance

**Status:** working compliance record for CodeChad. **Last reviewed:** 26 July 2026.
**Controller:** the solo operator of CodeChad, established in Portugal.
**Supervisory authority:** CNPD (Comissão Nacional de Proteção de Dados).

> This is a technical and organisational analysis written from the codebase, not legal
> advice. It is accurate about **what the software does**; the conclusions it draws about
> what the law requires should be confirmed with a lawyer before the app takes money.

Two dates make this urgent rather than theoretical:

| Date | What applies | Status here |
|---|---|---|
| **2 Aug 2026** (7 days) | **EU AI Act Art. 50** — users must be told they are interacting with AI | ⚠️ [Gap G3](#gap-register) |
| **19 Jun 2026** (in force) | **CRD Art. 11a withdrawal button** for online consumer contracts | Not yet relevant — no paid product. **Blocks launch of the subscription.** See [§9](#9-payments-and-subscription) |

---

## Contents

- [1. What the app actually processes](#1-what-the-app-actually-processes)
- [2. Legal bases](#2-legal-bases)
- [3. Processors, sub-processors and transfers](#3-processors-sub-processors-and-transfers)
- [4. Data subject rights](#4-data-subject-rights)
- [5. Security](#5-security)
- [6. Cookies and local storage](#6-cookies-and-local-storage)
- [7. Children](#7-children)
- [8. AI-specific obligations](#8-ai-specific-obligations)
- [9. Payments and subscription](#9-payments-and-subscription)
- [10. Retention schedule](#10-retention-schedule)
- [11. Breach procedure](#11-breach-procedure)
- [12. DPIA screening](#12-dpia-screening)
- [13. Gap register](#gap-register)
- [Sources](#sources)

---

## 1. What the app actually processes

This is the Article 30 record, built from the schema and the API routes rather than from
a template.

| # | Data | Where it comes from | Where it lives | Contains |
|---|---|---|---|---|
| A | **Account identity** — email, display name, avatar URL, provider id | Google OAuth, GitHub OAuth, or email+password | Supabase `auth.users` | Directly identifying |
| B | **Password** | Email signup | Supabase GoTrue, hashed | Never seen by the app; `api/auth/signup` passes it straight through |
| C | **Course state** — skill, level, goal, roadmap tree, progress | Generated from the learner's answers | `user_roadmap_state` (keyed `course_id`, FK `user_id`) | Learning goals, career intent |
| D | **Conversations** — every message to and from the tutor, plus calibration | The learner typing | `user_chat_state.messages`, `chat_messages` | **Free text — anything the user chooses to type** |
| E | **Submitted code** | The editor | Inside the roadmap `progress` JSON | Whatever the learner writes |
| F | **Onboarding flags** | App usage | `user_step_fulfillment` | Behavioural, trivial |
| G | **IP address** | Every HTTP request | **In memory only**, `src/lib/rateLimit.ts` | Identifying, transient |
| H | **Trial counter** | Anonymous visits | `localStorage` on the visitor's own device | Not held by us |

**The sensitive item is D.** Everything else is bounded and predictable; a free-text chat
box is not. A learner may type their employer, their salary, their health, their
immigration status — anything, into a field that is then sent to a third-party model. No
special-category data is *sought*, but the design cannot prevent it being volunteered.
That single fact drives most of the analysis below.

**Not processed:** no analytics, no advertising, no tracking pixels, no profiling for
decisions, no location beyond IP, no biometrics, no third-party data brokers. Verified by
grep — there is no `gtag`, `posthog`, `plausible`, or `document.cookie` anywhere in `src/`.

## 2. Legal bases

| Processing | Basis (Art. 6) | Note |
|---|---|---|
| Creating and running an account (A, B) | **Contract** 6(1)(b) | The user asked for the service |
| Storing courses, progress, code (C, E) | **Contract** 6(1)(b) | This *is* the service |
| Storing conversations (D) | **Contract** 6(1)(b) | Needed to resume a lesson |
| Sending prompts to Gemini | **Contract** 6(1)(b) | The tutor is the product; it cannot work without this |
| Text-to-speech (Read Aloud) | **Contract** 6(1)(b), user-initiated | Only fires when the button is pressed |
| IP rate limiting (G) | **Legitimate interests** 6(1)(f) | Balancing test: security purpose, in-memory only, no profiling, minimal — passes |
| Trial allowance (H) | **Legitimate interests** 6(1)(f) | Stored on the user's own device |
| Loading runtimes from CDNs | **Legitimate interests** 6(1)(f) | See [§3](#3-processors-sub-processors-and-transfers) — the weakest basis in this table |

**Consent is not used as a basis anywhere**, and that is deliberate: consent that can be
withdrawn cannot support processing the service cannot run without. It *would* be needed
for analytics or marketing email — neither exists.

## 3. Processors, sub-processors and transfers

| Party | Role | Gets | Transfer mechanism |
|---|---|---|---|
| **Supabase** | Processor — database + auth | A–F | DPA + SCCs; confirm project region |
| **Vercel** | Processor — hosting | Request data, IPs, logs | DPA + SCCs |
| **Google (Gemini API)** | Processor — lesson/roadmap generation | **D, E** and course context | Paid-tier terms; confirm no training on input |
| **Google / GitHub (OAuth)** | Independent controllers | Sign-in event | Their own policies |
| **Microsoft** (Edge read-aloud) | Processor in effect | **Lesson text** on each press | ⚠️ Undocumented — [Gap G4](#gap-register) |
| **jsDelivr, unpkg, Hugging Face** | Recipients of an IP address | Visitor **IP + user-agent** | ⚠️ No DPA — [Gap G5](#gap-register) |
| **DevDocs** (iframe) | Recipient of an IP address | Visitor IP when the docs pane opens | ⚠️ Same |

### The CDN problem, stated plainly

The runtimes are loaded from third-party CDNs at run time — **20 references to
`cdn.jsdelivr.net`** alone, plus `unpkg.com`, plus Hugging Face model weights for the
AI/ML module, plus a `devdocs.io` iframe. Every one of those is the visitor's browser
connecting to a third party, which necessarily discloses their **IP address**, before any
consent and without a contract.

This is the same shape as the *Google Fonts* line of German cases, where embedding a
remote asset that leaks an IP was held to infringe. The exposure is real but modest here:
the recipients are developer CDNs, not ad networks; there is no cookie and no
cross-site identifier; and the processing has an obvious technical purpose.

Three ways out, in order of cost:

1. **Disclose it** — name the CDNs in the privacy policy as recipients, with the purpose.
   Cheap, honest, and closes the transparency half of the problem today.
2. **Self-host the heavy runtimes** from the app's own origin. Removes the disclosure
   entirely for those assets; costs bandwidth and the pinning discipline the registry
   already has.
3. **Defer the load until the user presses Run** — several already do. A visitor who
   never opens a module then never contacts a CDN at all.

Do (1) now; (3) is mostly true already and worth completing; (2) only if a DPA ever
challenges it.

## 4. Data subject rights

| Right | Article | State | Where |
|---|---|---|---|
| Information | 13–14 | ✅ Detailed privacy policy | `src/app/privacy/page.tsx` |
| Access | 15 | ⚠️ Manual only | [Gap G2](#gap-register) |
| Rectification | 16 | ✅ Name and email editable | `AccountSettings.tsx`, `api/account` PATCH |
| **Erasure** | 17 | ✅ **Self-service, immediate** | `api/account` DELETE + `on delete cascade` |
| Portability | 20 | ⚠️ Missing | [Gap G2](#gap-register) |
| Objection | 21 | ✅ By email; only 6(1)(f) processing is objectable | — |
| No automated decisions | 22 | ✅ N/A — grading has no legal or similarly significant effect | — |

Erasure is the strongest part of the implementation and worth describing precisely,
because it is where most apps quietly fail. Account deletion calls the GoTrue admin API
to delete the `auth.users` row; migration `0006` added `on delete cascade` foreign keys
from **every** table to it, so roadmaps, chat state, chat messages, onboarding flags and
progress are removed by the database itself rather than by application code that can be
forgotten. The user types `DELETE` to confirm. There is no soft-delete and no grace
period, and the privacy policy says so.

> ⚠️ **This changes the moment you take money.** Invoices must survive erasure — see
> [§9.7](#97-erasure-vs-invoices--the-conflict-to-design-for).

## 5. Security

Article 32 measures actually in place:

- **Row Level Security is live.** Verified against the production database on
  **26 July 2026** by querying each table with the public anon key: all five now return
  `permission denied`. Before migrations `0005`/`0006` the same request returned **every
  row of every user's data** — the anon key ships in the browser bundle and is not a
  secret. That was a genuine exposure, and it is closed.
- **The service-role key is server-only.** `src/lib/supabaseAdmin.ts` is `server-only`;
  the key is never `NEXT_PUBLIC_`, never imported into a component.
- **Token verification never trusts the caller.** `src/lib/apiAuth.ts` verifies the JWT
  with the anon key rather than the service role, deliberately, so a forged token has less
  room to matter.
- **Passwords never touch app code** — handed to GoTrue, stored hashed.
- **Rate limiting** on anonymous generation and on signup (8/hour/IP), in memory.
- **Code execution is client-side and sandboxed** — Web Workers and sandboxed iframes.
  Learner code never runs on a server, which removes an entire class of breach.
- **Transport** — HTTPS throughout; a strict CSP on published artifacts.

Weaknesses to be honest about: rate-limit state is per-instance and resets on deploy;
there is no formal access log review; and there is no documented key-rotation schedule.

## 6. Cookies and local storage

| Key | Purpose | Classification |
|---|---|---|
| Supabase auth session | Keeps you signed in | Strictly necessary |
| `courses-sort` | Remembers a sort preference | Functional, first-party |
| DevDocs index cache | Avoids re-fetching an index | Functional, first-party |
| Trial counter | Free-lesson allowance | Functional, first-party |

**No consent banner is required today.** ePrivacy Art. 5(3) demands consent for storage
that is not strictly necessary, and the analysis usually turns on tracking — there is
none here: no analytics, no advertising, no third-party cookies, no cross-site
identifiers. The three functional keys are first-party, non-identifying and never leave
the device.

This holds **only while that is true**. Adding any analytics — including
"privacy-friendly" ones — puts a banner on the table. The [Digital Omnibus](#sources)
proposal would move cookie rules into the GDPR and standardise machine-readable consent
signals, but as of today it is **still in negotiation** and changes nothing.

## 7. Children

The service is not directed at children, but nothing prevents a 14-year-old signing up.

Portugal sets the digital-consent age at **13** (Lei 58/2019, art. 16 — the EU minimum).
That is *not* the operative number for an app reachable across the EU: the threshold that
applies is the one in the **user's own Member State**, and those range from 13 to 16
(Germany, Austria, Netherlands, Ireland, Spain, Italy: 16; France: 15).

Since the app processes on **contract**, not consent, Art. 8 is not directly engaged —
but contractual capacity of minors is a national-law question with the same messy spread.
The pragmatic position: state a **16+** requirement in the Terms, treat any report of a
younger user as a deletion request, and do not build age verification (which would mean
collecting *more* identifying data to solve a problem the service does not have).

## 8. AI-specific obligations

### Art. 50 transparency — applies 2 August 2026

The tutor is an AI system that interacts directly with people, so it must be designed so
that users are **informed they are interacting with AI**, at the point of first
interaction, accessibly.

CodeChad is largely there in substance — the product is openly "an AI tutor" and the
landing page says so — but "the marketing says AI" is not the same as an in-product
disclosure at first interaction. The fix is small: a one-line, permanently visible marker
in the chat panel's first message. **[Gap G3](#gap-register), and the deadline is seven
days away.**

Art. 50 also requires providers of generative systems to mark synthetic output in a
machine-readable form. That duty falls on **Google as the model provider**, not on this
app as deployer. The deployer-side marking duty is narrow — deepfakes, and text published
to inform the public on matters of public interest. Lesson text for one learner is
neither.

### Risk classification

Annex III(3)(b) makes "AI intended to evaluate learning outcomes" **high-risk** — and
this app does grade exercises, so the question deserves a real answer rather than a
shrug. The classification turns on the qualifier: *"in educational and vocational training
institutions"*. CodeChad is a consumer self-study app. It is not an institution, it gates
no admission, it awards no credential, and its grading has no consequence outside the
learner's own progress bar.

**Assessment: not high-risk.** Re-open this immediately if any of the following change —
each would move the app toward Annex III:

- issuing certificates or credentials of any kind;
- selling to schools, universities or employers as an assessment tool;
- results being reported to any third party (an employer, a bootcamp, a funder);
- gating access to anything outside the app on a score.

The **AI Omnibus adopted 29 June 2026** postpones high-risk deadlines, which widens the
margin but does not change the reasoning.

## 9. Payments and subscription

**Nothing is implemented today** — there is no payment provider in `package.json`, no
billing table, no price anywhere in the UI, and the privacy policy correctly describes a
non-commercial service. Everything here is what must be true **before** the first euro is
taken. Taking money changes the app's regulatory character more than any feature has.

### 9.1 Architecture: use Stripe's hosted Checkout, and not for the obvious reason

The usual argument for hosted checkout is PCI scope. Here there is a second, sharper one.

Under **PCI DSS 4.0.1** — fully in force since March 2025 — requirements **6.4.3** and
**11.6.1** apply even to SAQ A merchants. Every script that loads on the **payment page**
must be inventoried, authorised, integrity-assured and monitored for tampering.

Now recall what this app's pages load: **20+ references to jsDelivr**, plus unpkg, plus
Hugging Face, plus WASM toolchains pulled at run time. Embedding Stripe Elements into a
page of this application would drag that entire, deliberately dynamic script surface into
PCI scope, and the SAQ A eligibility statement — that the site is not susceptible to
scripts affecting the payment environment — would be difficult to make honestly.

**Therefore:**

- **Use Stripe Checkout as a full redirect** to Stripe's own domain, or a dedicated
  minimal billing page that loads *nothing* from a CDN.
- **Never** put Elements on a page that also hosts the workspace or the landing grid.
- **Never** store, log or transmit a PAN, CVV or expiry. Card data must not reach the
  server at all — if it never arrives, it cannot leak.
- Keep the script inventory for the billing page in version control; that is the artefact
  6.4.3 asks for.

This is the one architectural decision here that is expensive to reverse.

### 9.2 What billing adds to the data record

| Data | Where | Basis | Note |
|---|---|---|---|
| Stripe customer id, subscription id, status | Our DB (new table) | Contract | Pseudonymous handles, not card data |
| Card details | **Stripe only** | — | Never ours |
| Billing name, address, country | Stripe; country copied to us | Contract + **legal obligation** (VAT) | Country is needed for VAT |
| Invoices | Stripe; ours by reference | **Legal obligation** 6(1)(c) | See 9.5 |
| Payment events | Webhook → our DB | Contract | Verify the webhook signature |

Stripe is a **processor** for the payment operation and a **controller** for its own fraud
prevention and regulatory duties — dual-role. Its DPA must be executed, its
sub-processors reviewed, and it must be added to the privacy policy's recipient list
*before* launch, not after.

### 9.3 Strong Customer Authentication

Under PSD2, EU card payments need **SCA**, and recurring subscriptions have a specific
pattern: the first payment is authenticated with 3DS and the mandate is stored, later
charges run as merchant-initiated transactions against that mandate. Practically this
means using Stripe's `off_session`/`setup_future_usage` flow rather than re-charging a
raw card, and handling the case where a renewal is declined and *does* require
re-authentication — the user must be able to complete a challenge after the fact.

### 9.4 VAT

Selling a subscription to EU consumers is a **digital service**, taxed where the customer
is, not where the seller is:

- Below **€10,000/year** of cross-border B2C sales, a Portugal-established seller may
  charge Portuguese VAT on all of it.
- Above it, charge each customer's national rate (17–27%) and register for **OSS** —
  one quarterly return covering the EU.
- Collect and store **two non-contradictory pieces of evidence** of customer location
  (billing country + IP country is the standard pair). Note this is a *new* reason to
  retain an IP-derived signal that today is memory-only — decide it deliberately.
- B2B sales inside the EU reverse-charge on a validated VAT number.
- Invoices must carry the legally required fields and be retained for **10 years** under
  Portuguese rules.

### 9.5 Consumer withdrawal — and the button that is already law

A consumer buying a subscription online has **14 days** to withdraw, no reason needed.
For digital services there is a specific mechanic worth getting right, because it is the
difference between a refundable month and a refundable minute:

- The user may **expressly request** the service start immediately and **acknowledge that
  they lose the withdrawal right** once it is fully performed. That is two explicit
  affirmations at checkout — not a pre-ticked box, not buried in the Terms.
- Without that, the 14 days run in full and the service must be refunded.
- If they withdraw after starting, they pay only a **proportionate** amount for what was
  used.

**And since 19 June 2026, Art. 11a of the Consumer Rights Directive (inserted by
Directive (EU) 2023/2673) requires a withdrawal *function*** on any online interface where
a withdrawal right exists:

- a control **clearly labelled** "withdraw from the contract here" or equivalent;
- **accessible throughout** the 14-day window;
- leading to a **structured two-step confirmation**;
- producing an **automatic confirmation to the consumer without undue delay**.

A PDF form or "email us to cancel" does **not** comply. This is in force now — it is not
something to schedule for later; it gates the launch of the paid tier.

### 9.6 Cancellation UX

Distinct from withdrawal: cancelling an ongoing subscription must not be harder than
starting it. Self-service, in-app, no retention maze, no confirmshaming. The **Digital
Fairness Act** — proposal expected late 2026 — explicitly targets subscription traps,
dark patterns and manipulative cancellation flows. Building the honest version now costs
nothing and pre-empts it.

Given this app already has `AccountSettings` with a working self-service deletion flow,
the subscription controls belong beside it, at the same level of directness.

### 9.7 Erasure vs invoices — the conflict to design for

Today, account deletion cascades everything. **Once invoices exist, that is no longer
lawful to do wholesale**: tax law requires keeping them (10 years), and Art. 17(3)(b)
carves out processing required by legal obligation.

So the erasure path must be split rather than extended:

- **Delete** identity, courses, conversations, code — as now.
- **Retain** the invoice record and the minimum identity attached to it, under legal
  obligation, isolated from the app's tables so no cascade can take it.
- **Say so in the privacy policy**, because a user who deletes their account and then
  sees an invoice in their inbox will reasonably think the promise was broken.
- Practically: keep billing rows in a table **without** an `on delete cascade` FK to
  `auth.users`, and let Stripe remain the system of record for invoices.

This is the single most likely place for the current design to break a promise it makes
today, and it is much cheaper to plan for than to unpick.

## 10. Retention schedule

| Data | Retention | Trigger |
|---|---|---|
| Account, courses, chats, code | Until the user deletes the account | Self-service, immediate, cascading |
| IP (rate limiting) | Minutes — memory only | Process restart or window expiry |
| Trial counter | Until the user clears their browser | On their device |
| Auth logs | Per Supabase defaults | ⚠️ Confirm and document |
| **Invoices (future)** | **10 years** | Legal obligation, survives erasure |
| Backups | Per Supabase defaults | ⚠️ Confirm — erasure must reach them within the cycle |

## 11. Breach procedure

1. **Contain** — rotate the affected key first. The service-role key and the Gemini key
   are the two that matter; rotation is a Vercel env change plus a redeploy.
2. **Assess** — what data, whose, how many, and is it likely to risk their rights.
3. **Notify CNPD within 72 hours** of becoming aware, unless unlikely to result in risk.
   (The Digital Omnibus proposes 96 hours; **it is not law** — assume 72.)
4. **Notify users** without undue delay where the risk is high.
5. **Record it** regardless of whether it was notifiable — Art. 33(5) requires the
   internal register even for breaches you decide not to report.

The realistic scenarios for this app are: the service-role key leaking, a Supabase
misconfiguration re-exposing tables (this **already happened once** and was caught — see
[§5](#5-security)), or a processor's own breach.

## 12. DPIA screening

A DPIA is required for processing likely to result in high risk (Art. 35). Screening
against the criteria: no systematic monitoring, no large-scale special-category data, no
automated decisions with legal effect, no vulnerable-group targeting, no data matching, no
innovative technology used *on* people. **Conclusion: no DPIA required.**

Two things would flip it: a change that makes the app process education data on behalf of
institutions, or any use of conversation content for model training or profiling.

## Gap register

| ID | Gap | Severity | Fix |
|---|---|---|---|
| **G1** | Privacy policy predates the AI/CDN/TTS analysis here | High | Add Gemini, Microsoft TTS, and the CDNs as recipients |
| **G2** | No self-service export (Arts. 15, 20) | High | `GET /api/account/export` → JSON of the user's own rows. The queries already exist |
| **G3** | **No in-product AI disclosure at first interaction** | **High — 2 Aug 2026** | One line in the chat panel's opening message |
| **G4** | TTS sends lesson text to a Microsoft endpoint, undisclosed | Medium | Disclose, or make it opt-in per session |
| **G5** | CDNs receive visitor IPs with no disclosure | Medium | Disclose now; consider self-hosting later |
| **G6** | Cascade FKs (`0006`) not verifiable from outside the DB | Medium | Confirm the constraints exist in production |
| **G7** | Backup and auth-log retention unknown | Low | Confirm with Supabase, write it into §10 |
| **G8** | No Terms age statement | Low | State 16+ |
| **G9** | No processor register with DPA dates | Low | One table; §3 is most of it |
| **P1–P6** | Everything in [§9](#9-payments-and-subscription) | **Blocks launch** | Hosted checkout · Stripe DPA · SCA · VAT/OSS · **withdrawal button** · split erasure |

Fix order: **G3** (deadline in 7 days), then **G1/G2/G5** (one policy update and one
endpoint), then the rest. The payment items only matter when the subscription is built,
but **P5 and P6 must be designed in from the start** — retrofitting a withdrawal button
and unpicking a cascading delete are both far worse later.

## Sources

Regulation and guidance:

- [Art. 50 AI Act — transparency obligations](https://artificialintelligenceact.eu/article/50/) · [Commission guidelines on transparency](https://digital-strategy.ec.europa.eu/en/news/commission-publishes-guidelines-transparency-obligations-providers-and-deployers-certain-ai-systems) · [what applies from Aug 2026](https://www.digitalapplied.com/blog/eu-ai-act-august-2026-transparency-obligations-agency-checklist)
- [EU Digital Omnibus — status and proposed GDPR changes](https://privacyforge.io/resources/blog/eu-digital-omnibus-gdpr-ai-act-2026) · [EDPB position](https://www.igdpr.eu/en/digital-omnibus-gdpr-changes/)
- [Consumer information and right of withdrawal (EUR-Lex summary)](https://eur-lex.europa.eu/EN/legal-content/summary/consumer-information-right-of-withdrawal-and-other-consumer-rights.html)
- [The withdrawal button from 19 June 2026 — scope and mechanics](https://www.arnoldporter.com/en/perspectives/advisories/2026/05/eu-withdrawal-button-uk-subscription-rules-and-data-protection-risks-for-us-online-sellers)
- [Digital Fairness Act — legislative train](https://www.europarl.europa.eu/legislative-train/theme-protecting-our-democracy-upholding-our-values/file-digital-fairness-act) · [digital subscriptions analysis](https://www.insideprivacy.com/consumer-protection/digital-fairness-act-series-topic-4-digital-subscriptions/)
- [PCI DSS 4.0.1 — what 6.4.3 and 11.6.1 still require with Stripe](https://cside.com/blog/does-stripe-make-you-pci-compliant-6-4-3-11-6-1) · [SAQ A for hosted checkout](https://pcidss-dashboard.com/blog/saq-a-for-hosted-checkout-pages-what-you-need-to-know/)
- [EU VAT for SaaS — OSS and the €10k threshold](https://dodopayments.com/blogs/eu-vat-saas-guide-2026) · [OSS registration](https://fungies.io/eu-vat-oss-scheme-saas/)
- [Portugal — Lei 58/2019 and the age of 13](https://www.legiscope.com/blog/lei-58-2019-execucao-rgpd.html)

Evidence from this repository (all re-checkable):

- Schema and RLS — `supabase/migrations/0001`–`0006`
- Erasure — `src/app/api/account/route.ts`, `src/components/AccountSettings.tsx`
- Auth and token verification — `src/lib/apiAuth.ts`, `src/lib/supabaseAdmin.ts`
- IP handling — `src/lib/rateLimit.ts`
- Model calls — `src/lib/agents/*.ts` → `generativelanguage.googleapis.com`
- TTS — `src/app/api/tts/route.ts`
- CDN surface — `src/lib/runtimes/*`
- Current disclosures — `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`
- RLS verified closed against production, 26 July 2026 (anon key → `permission denied` on
  all five tables)
