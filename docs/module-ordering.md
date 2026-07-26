# Ordering the landing page by profitability

The card order on the landing page — the section groups, the modules inside them, and the
career paths — is **ranked by expected earnings for the learner**, not by our taste and not
alphabetically. This file holds the evidence, so the order can be argued with and
refreshed instead of drifting.

**Metric: pay × the chance of being hired for it.** Median salary alone ranks a language
nobody hires for above one that half the industry runs on; posting volume alone ranks the
cheapest work first. Both are needed.

**Researched: July 2026.** Figures are US-centric, which is the largest market and the
best-measured one — see [Caveats](#caveats).

## Evidence

### Roles — the destination, and what decides the group order

| Role | Median / average | Source |
|---|---|---|
| Cloud Infrastructure Engineer | **$189,000** | Stack Overflow 2025 (US) |
| Backend Developer | $175,000 | Stack Overflow 2025 (US) |
| Data Scientist / ML Specialist | $145,000 | Stack Overflow 2025 (US) |
| Frontend Developer | $145,000 | Stack Overflow 2025 (US) |
| Backend Developer | ~$161,000 avg | Indeed 2026 |
| DevOps Engineer | ~$133–145,000 avg | Indeed / Glassdoor 2026 |
| AI/ML Engineer | $142k median base · $185k avg · $244k+ total comp | Glassdoor / Built In / Levels.fyi 2026 |
| Data Analyst | ~$86,000–93,400 avg | Indeed / Glassdoor 2026 |
| Power BI Analyst | ~$73,000–109,000 | ZipRecruiter / Glassdoor 2026 |

The single most useful line here: **cloud infrastructure pays more than backend**, and
backend pays roughly **twice** what data analysis pays.

### Usage — professional developers, Stack Overflow 2025

| Technology | Usage | Note |
|---|---|---|
| Docker | **73.8%** | +17pt in one year — the largest single-year rise of any technology surveyed |
| JavaScript | 68.8% | |
| SQL | 61.3% | |
| PostgreSQL | 58.2% | most-used database |
| Python | 54.8% | +7pt year on year |
| Bash/Shell | 48.8% | |
| TypeScript | 48.8% | |
| AWS | 45.9% | |
| MySQL / SQLite | 39.6% / 36.9% | |
| Kubernetes | 30.1% | |

In DevOps postings specifically: CI/CD 67%, automation 58%, Kubernetes 56%, AWS 54%,
Python 53% — i.e. the whole cluster sits on top of Linux.

### Languages — pay

| Language | Median / range | Note |
|---|---|---|
| Rust | ~$170,000 | not a module yet |
| Go | ~$155,000 (US $135–175k) | top-3 pay, and ~3–4× Rust's job volume |
| TypeScript | ~$129–155,000 | ~15% premium over JavaScript |
| Python | ~$125,000 | largest and fastest-growing surface |
| Ruby | ~$129,500 avg | strong pay, shrinking (Rails) market |
| JavaScript | ~$115–135,000 | most jobs, lowest pay of the top four |
| C | $112,000 (Indeed) – $135,400 (Salary.com) | stable embedded/systems demand |
| PHP | $83,800 (Indeed) – $102,000 (ZipRecruiter) | large market, lowest pay |
| Lua | no comparable figure | niche: Roblox, Neovim, game modding |

### Frontend

React ~150,000 active listings vs Vue ~35,000 (3–5× on US/EU boards); React 42–48% market
share vs Vue 8.7–18.7%. Senior React $140–195k, senior Vue $120–170k.

| Skill | Rate | Source |
|---|---|---|
| Tailwind CSS (as the listed skill) | $34.07/hr avg (~$71k), $26.92–45.67 range | ZipRecruiter 2026 |
| Tailwind, entry level | $16.94/hr | ZipRecruiter 2026 |
| Next.js + Tailwind | $58.23/hr (~$121k) | ZipRecruiter 2026 |

That spread is the whole story for Tailwind: on its own it is markup work near the bottom
of the market; attached to a framework it nearly doubles. It is a **modifier, not a job**.

## The resulting order

### Groups

1. **Languages** — the only group that is both the best-paid ($155–175k) and the largest
   hiring surface. Unambiguous.
2. **Tools** — Linux is the gateway to the highest-paid IC role measured ($189k), and the
   technology cluster above it is the most-used in the industry (Docker 73.8%).
3. **Web & Runtimes** — React's listing volume is enormous, but frontend's median ($145k)
   trails backend's ($175k).
4. **Databases** — SQL and PostgreSQL are on ~60% of professional stacks, but as a
   *primary* skill they pay analyst money ($86–120k). Near-universal **secondary** skill.
5. **Graphics & AI** — the highest ceiling per role and the thinnest market. See the
   honest caveat below.

The dividing line: groups 1–3 are things you are hired **as**; group 4 is what you are
hired **with**; group 5 has the best pay and the fewest doors.

### Within the groups

- **Languages**: Go · TypeScript · Python · JavaScript · C · Ruby · PHP · Lua
  C over Ruby is the closest call on the page — Ruby's average pay is higher ($129.5k vs
  $112–135k), but C's demand is stable where Rails is shrinking. Reasonable people flip it.
- **Tools**: Linux · Git — Linux carries this group; Git is table stakes, on every job ad
  and never the reason anyone is hired.
- **Web & Runtimes**: React · Vue · CSS · Tailwind CSS · WebAssembly
  The two frameworks lead because they are job titles. CSS sits above Tailwind despite
  being the less fashionable line on a CV: it is a hard prerequisite for both frameworks
  and appears in effectively every frontend ad, where Tailwind's own measured rate
  ($34/hr standalone) is the lowest figure in this group. Tailwind earns its place
  because *paired* with a framework it nearly doubles ($58/hr) — but you cannot pair
  what you do not have.
- **Databases**: PostgreSQL · DuckDB · SQLite — SQLite has far higher usage (36.9%) than
  DuckDB, but it is deployment count, not hiring signal; DuckDB shows up in modern data
  stack postings, SQLite essentially never does.
- **Graphics & AI**: AI/ML · Three.js

### Career paths

**Backend** ($175k) → **DevOps** ($133–189k depending on title) → **Data Analyst**
($86–93k). Backend leads despite cloud infrastructure's higher ceiling because DevOps is
rarely a *first* job — it is normally reached through development experience, which is
why our own DevOps path teaches Go and HTTP servers before it teaches Kubernetes.

## Caveats

Three things this ordering does not know, and one place it is deliberately conservative:

- **The AI/ML card is not the AI/ML job.** The $185k figure is for engineers building on
  the Python/PyTorch stack. Our module teaches in-browser inference with transformers.js,
  which is a genuinely useful skill and *not* the one those postings hire for. That gap,
  not the pay, is why the group sits last.
- **US-weighted.** A Portugal- or EU-weighted ranking would likely push Go down and
  PHP/JavaScript up, since that market skews toward agency and product web work.
- **The market shrank.** US software developer postings on Indeed are down ~33% from 2020
  and ~35% from the early-2024 peak, with entry level hit hardest. AI postings moved the
  other way: 4.2% of all jobs, up 134% since 2020. Rankings here are relative positions in
  a smaller pool.
- **Averages hide seniority.** Every figure above mixes levels. None of them is what a
  first job pays.

## Sources

- [Stack Overflow Developer Survey 2025 — Technology](https://survey.stackoverflow.co/2025/technology/)
- [Stack Overflow Developer Survey 2025 — Work](https://survey.stackoverflow.co/2025/work/)
- [Stack Overflow 2025 salary data by role (US)](https://techrecruiting.io/en/stack-overflow-developer-survey-2025-usa/)
- [Indeed — backend developer salaries](https://www.indeed.com/career/back-end-developer/salaries)
- [Indeed — DevOps engineer salaries](https://www.indeed.com/career/devops-engineer/salaries)
- [Indeed — data analyst salaries](https://www.indeed.com/career/data-analyst/salaries)
- [Indeed — PHP developer salaries](https://www.indeed.com/career/php-developer/salaries)
- [Indeed — C developer salaries](https://www.indeed.com/career/c-developer/salaries)
- [Glassdoor — Ruby developer](https://www.glassdoor.com/Salaries/ruby-developer-salary-SRCH_KO0,14.htm)
- [Glassdoor — AI/ML engineer](https://www.glassdoor.com/Salaries/ai-ml-engineer-salary-SRCH_KO0,14.htm)
- [KORE1 — Kubernetes engineer salary guide 2026](https://www.kore1.com/kubernetes-engineer-salary-guide/)
- [InterviewStack — DevOps skills in postings, 2026](https://interviewstack.io/blog/devops-engineer-skills-companies-want-2026)
- [tech-insider — TypeScript vs JavaScript 2026](https://tech-insider.org/typescript-vs-javascript-2026/)
- [tech-insider — React vs Vue 2026](https://tech-insider.org/react-vs-vue-2026/)
- [ZipRecruiter — Tailwind CSS pay](https://www.ziprecruiter.com/Jobs/Tailwind-Css)
- [ZipRecruiter — Next.js + Tailwind pay](https://www.ziprecruiter.com/Jobs/Next-Js-Tailwind)
- [Visual Capitalist — the decline of US software developer jobs](https://www.visualcapitalist.com/charted-the-decline-of-u-s-software-developer-jobs/)
- [Indeed Hiring Lab — 2026 US jobs & hiring trends](https://www.hiringlab.org/2025/11/20/indeed-2026-us-jobs-hiring-trends-report/)
